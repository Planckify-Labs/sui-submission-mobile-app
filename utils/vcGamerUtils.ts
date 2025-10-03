export interface TVCGamerPLNVoucher {
  tokenCode: string;
  name: string;
  tarifOrPower: string;
  kwhCapacity: string;
}

const extractPLNVoucher = (voucherCode: string): TVCGamerPLNVoucher => {
  const parts = voucherCode.split("/");
  console.log("voucherCode", voucherCode);

  if (parts.length === 5 && !parts[1].includes(":")) {
    const [tokenCode, name, tarif, power, kwh] = parts;
    return {
      tokenCode,
      name,
      tarifOrPower: `${tarif}/${power}`,
      kwhCapacity: kwh,
    };
  }

  const [tokenCode, _meterNumber, name, power, voltageCapacity, kwhCapacity] =
    parts;
  return {
    tokenCode,
    name: name.includes(":") ? name.split(":")[1] : name,
    tarifOrPower: power.includes(":")
      ? `${power.split(":")[1]}/${voltageCapacity}`
      : `${power}/${voltageCapacity}`,
    kwhCapacity:
      kwhCapacity && kwhCapacity.includes(":")
        ? kwhCapacity.split(":")[1]
        : kwhCapacity || "",
  };
};

type TVoucherType = "PLN";

export const extractVoucher = (
  voucherType: TVoucherType,
  voucherCode: string,
) => {
  switch (voucherType) {
    case "PLN":
      return extractPLNVoucher(voucherCode);

    default:
      break;
  }
};
