import type { TRedemptionDetail } from "@/api/types/redeem";
import type { TPurchaseResponse } from "@/api/types/purchase";
import type { TTransaction } from "@/api/types/transaction";
import PurchasedProductDetailCard from "./render-activity-detail-cards/PurchasedProductDetailCard";
import TransferDetailCard from "./render-activity-detail-cards/TransferDetailCard";

export default function RenderActivityDetailCards({
  purchase,
  transfer,
  redemption,
}: {
  purchase?: TPurchaseResponse;
  transfer?: TTransaction;
  redemption?: TRedemptionDetail;
}) {
  return (
    <>
      {purchase && <PurchasedProductDetailCard purchase={purchase} />}
      {redemption && <PurchasedProductDetailCard redemption={redemption} />}
      {transfer && <TransferDetailCard transfer={transfer} />}
    </>
  );
}
