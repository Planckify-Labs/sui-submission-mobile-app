import React from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

type Props = { size?: number };

const RED = "#c71c4b";
const BLACK = "#20222c";

const Halo = () => (
  <>
    <Circle cx={100} cy={100} r={82} fill={RED} fillOpacity={0.07} />
    <Circle
      cx={100}
      cy={100}
      r={66}
      fill="none"
      stroke={RED}
      strokeOpacity={0.2}
      strokeWidth={1}
      strokeDasharray="3 5"
    />
  </>
);

const Sparkles = ({
  positions = [
    { cx: 42, cy: 72, r: 2.5, op: 0.45 },
    { cx: 158, cy: 132, r: 3, op: 0.4 },
    { cx: 150, cy: 56, r: 2, op: 0.35 },
    { cx: 48, cy: 150, r: 2.5, op: 0.3 },
  ],
}: {
  positions?: { cx: number; cy: number; r: number; op: number }[];
}) => (
  <G>
    {positions.map((p) => (
      <Circle
        key={`${p.cx}-${p.cy}`}
        cx={p.cx}
        cy={p.cy}
        r={p.r}
        fill={RED}
        fillOpacity={p.op}
      />
    ))}
  </G>
);

export function TransfersEmptyArt({ size = 160 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Halo />
      {/* motion streaks behind the coin */}
      <G stroke={RED} strokeWidth={3.5} strokeLinecap="round">
        <Line x1={34} y1={84} x2={58} y2={90} strokeOpacity={0.25} />
        <Line x1={28} y1={102} x2={60} y2={102} strokeOpacity={0.45} />
        <Line x1={34} y1={120} x2={58} y2={114} strokeOpacity={0.25} />
      </G>
      {/* coin drop-shadow */}
      <Ellipse cx={116} cy={142} rx={30} ry={5} fill={BLACK} fillOpacity={0.08} />
      {/* coin body */}
      <Circle cx={114} cy={102} r={36} fill={RED} />
      <Circle
        cx={114}
        cy={102}
        r={36}
        fill="none"
        stroke={BLACK}
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      {/* dashed inner ring — mon-inspired detail */}
      <Circle
        cx={114}
        cy={102}
        r={27}
        fill="none"
        stroke="#fff"
        strokeWidth={1.5}
        strokeOpacity={0.55}
        strokeDasharray="2 3"
      />
      {/* outbound arrow on coin face (up-right = "sent") */}
      <Path
        d="M101 115 L124 92"
        stroke="#fff"
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M110 92 L124 92 L124 106"
        stroke="#fff"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Sparkles />
    </Svg>
  );
}

export function PaymentsEmptyArt({ size = 160 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Halo />
      {/* receipt with torn zigzag bottom */}
      <Path
        d="M68 58 H132 V146 L124 140 L116 146 L108 140 L100 146 L92 140 L84 146 L76 140 L68 146 Z"
        fill="#fff"
        stroke={BLACK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* QR finder markers (3 corners) */}
      <G fill={RED}>
        <Rect x={76} y={68} width={13} height={13} rx={2} />
        <Rect x={111} y={68} width={13} height={13} rx={2} />
        <Rect x={76} y={102} width={13} height={13} rx={2} />
      </G>
      <G fill="#fff">
        <Rect x={79} y={71} width={7} height={7} rx={1} />
        <Rect x={114} y={71} width={7} height={7} rx={1} />
        <Rect x={79} y={105} width={7} height={7} rx={1} />
      </G>
      <G fill={BLACK} fillOpacity={0.75}>
        <Rect x={80.5} y={72.5} width={4} height={4} />
        <Rect x={115.5} y={72.5} width={4} height={4} />
        <Rect x={80.5} y={106.5} width={4} height={4} />
      </G>
      {/* QR data dots */}
      <G fill={BLACK} fillOpacity={0.7}>
        <Rect x={94} y={70} width={3} height={3} />
        <Rect x={102} y={74} width={3} height={3} />
        <Rect x={106} y={70} width={3} height={3} />
        <Rect x={94} y={108} width={3} height={3} />
        <Rect x={102} y={112} width={3} height={3} />
        <Rect x={108} y={106} width={3} height={3} />
        <Rect x={114} y={108} width={3} height={3} />
        <Rect x={102} y={104} width={3} height={3} />
      </G>
      {/* receipt text lines */}
      <Line
        x1={78}
        y1={126}
        x2={122}
        y2={126}
        stroke={BLACK}
        strokeOpacity={0.25}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Line
        x1={78}
        y1={132}
        x2={108}
        y2={132}
        stroke={BLACK}
        strokeOpacity={0.25}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Sparkles
        positions={[
          { cx: 44, cy: 70, r: 2.5, op: 0.45 },
          { cx: 156, cy: 138, r: 3, op: 0.4 },
          { cx: 152, cy: 60, r: 2, op: 0.35 },
          { cx: 50, cy: 152, r: 2.5, op: 0.3 },
        ]}
      />
    </Svg>
  );
}

export function RedemptionsEmptyArt({ size = 160 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Halo />
      {/* gift box body */}
      <Rect
        x={60}
        y={96}
        width={80}
        height={54}
        rx={6}
        fill="#fff"
        stroke={BLACK}
        strokeWidth={2.5}
      />
      {/* gift box lid */}
      <Rect
        x={56}
        y={84}
        width={88}
        height={18}
        rx={4}
        fill="#fff"
        stroke={BLACK}
        strokeWidth={2.5}
      />
      {/* vertical ribbon */}
      <Rect x={94} y={84} width={12} height={66} fill={RED} />
      {/* horizontal ribbon across lid */}
      <Rect x={56} y={91} width={88} height={4} fill={RED} />
      {/* bow loops (origami fold style) */}
      <Path d="M100 84 L72 70 L84 84 Z" fill={RED} />
      <Path d="M100 84 L128 70 L116 84 Z" fill={RED} />
      {/* bow knot */}
      <Circle cx={100} cy={84} r={4} fill={BLACK} />
      {/* tiny streamers hanging from knot */}
      <Path
        d="M100 86 Q 96 90 92 96"
        stroke={RED}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M100 86 Q 104 90 108 96"
        stroke={RED}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Sparkles
        positions={[
          { cx: 40, cy: 80, r: 2.5, op: 0.45 },
          { cx: 160, cy: 130, r: 3, op: 0.4 },
          { cx: 154, cy: 64, r: 2, op: 0.35 },
          { cx: 46, cy: 152, r: 2.5, op: 0.3 },
        ]}
      />
    </Svg>
  );
}
