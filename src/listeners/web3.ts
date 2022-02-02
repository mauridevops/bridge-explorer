import { providers } from "ethers";
import { Minter__factory, UserNftMinter__factory } from "xpnet-web3-contracts";
import { PrismaClient } from ".prisma/client";
import { IEventRepo } from "../db/repo";

const prisma = new PrismaClient();

export interface IContractEventListener {
  listen(): void;
}

export function contractEventService(
  provider: providers.Provider,
  minterAddress: string,
  userNftMinterAddress: string,
  chainName: string,
  chainNonce: string,
  eventRepo: IEventRepo
): IContractEventListener {
  return {
    listen: () => {
      const contract = Minter__factory.connect(minterAddress, provider);
      const xpnft = UserNftMinter__factory.connect(
        userNftMinterAddress,
        provider
      );
      const mintEvent = xpnft.filters.Transfer();

      const transferEvent = contract.filters.TransferErc721();
      const unfreezeEvent = contract.filters.UnfreezeNft();
      xpnft.on(mintEvent, async (from, to, id, event) => {
        const ev = await eventRepo.findEvent(to);
        if (ev) {
          await eventRepo.updateEvent(ev.id, event.transactionHash);
        }
      });
      contract.on(
        transferEvent,
        async (actionId, targetNonce, txFees, to, tokenId, contract, event) => {
          await eventRepo.createEvent({
            actionId: actionId.toString(),
            chainName,
            eventId: tokenId.toString(),
            fromChain: chainNonce,
            toChain: targetNonce.toString(),
            fromHash: event.transactionHash,
            txFees: txFees.toString(),
            type: "Transfer",
            status: "pending",
            toHash: undefined,
            senderAddress: event.address,
            targetAddress: to,
          });
          console.log(
            `${chainName} ${chainNonce}  ${targetNonce} ${actionId} ${txFees} ${to} ${tokenId} ${contract}`
          );
        }
      );
      contract.on(unfreezeEvent, async (actionId, txFees, to, value, event) => {
        await eventRepo.createEvent({
          actionId: actionId.toString(),
          chainName,
          eventId: undefined,
          fromChain: undefined,
          toChain: chainNonce,
          txFees: txFees.toString(),
          type: "Transfer",
          status: "success",
          fromHash: event.transactionHash,
          toHash: undefined,
          senderAddress: event.address,
          targetAddress: undefined,
        });
        console.log(
          `${chainName} ${chainNonce} ${actionId} ${txFees} ${to} ${value}`
        );
      });
    },
  };
}
