import React from "react";
import TakumipayHeaderLogoSvg from "@/assets/images/Takumipay_ai_companion_header.svg";

interface TTakumiLogoProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function TakumipayHeaderLogo({
  width = 120,
  height = 24,
  color = "#20222c",
}: TTakumiLogoProps) {
  return <TakumipayHeaderLogoSvg width={width} height={height} color={color} />;
}
