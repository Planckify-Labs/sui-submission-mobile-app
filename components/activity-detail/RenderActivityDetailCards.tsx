import { TPurchaseCompleted } from "@/api/types/purchase";
import { TTransaction } from "@/api/types/transaction";
import PurchasedProductDetailCard from "./render-activity-detail-cards/PurchasedProductDetailCard";
import TransferDetailCard from "./render-activity-detail-cards/TransferDetailCard";

export default function RenderActivityDetailCards({
  purchase,
  transfer,
}: {
  purchase?: TPurchaseCompleted;
  transfer?: TTransaction;
}) {
  return (
    <>
      {purchase && <PurchasedProductDetailCard purchase={purchase} />}
      {transfer && <TransferDetailCard transfer={transfer} />}
    </>
  );
}
