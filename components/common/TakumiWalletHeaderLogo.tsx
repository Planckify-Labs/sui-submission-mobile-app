import React from "react";
import HeaderLogoSvg from "@/assets/images/header_logo.svg";

interface TTakumiLogoProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function TakumiWalletHeaderLogo({
  width = 120,
  height = 24,
  color = "#20222c",
}: TTakumiLogoProps) {
  return <HeaderLogoSvg width={width} height={height} color={color} />;
}
