"use client";

import { useEffect, useRef } from "react";
import { describeProgram, type Program } from "@/lib/observatory/specimen";
import { rgbChannels } from "@/lib/appearance";
import { useObservatoryPaint } from "./observatory-paint";

// A field visualization of the rule list. No random decoration or fitness input.
export function SpecimenPortrait({ program, name, small = false }: { program: Program; name: string; small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paint = useObservatoryPaint();
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const side = small ? 120 : 440;
    canvas.width = side;
    canvas.height = side;
    const metrics = describeProgram(program);
    const lobes = program.rules.map((rule, index) => {
      const angle = index / program.rules.length * Math.PI * 2 - Math.PI / 2;
      const direction = "direction" in rule.action ? rule.action.direction : "";
      const reach = .18 + Math.min(rule.when.length, 5) * .018 + (direction === "left" ? .035 : direction === "back" ? -.025 : 0);
      return { x: .5 + Math.cos(angle) * reach, y: .5 + Math.sin(angle) * reach, radius: .055 + Math.min(rule.when.length, 5) * .008, rule };
    });
    const image = context.createImageData(side, side);
    const warm = program.rules.filter(rule => rule.action.kind === "write" || rule.remember).length / Math.max(1, program.rules.length);
    const background = rgbChannels(paint.surface);
    const coolInk = rgbChannels(paint.success), warmInk = rgbChannels(paint.warning);
    const ink = coolInk.map((channel, index) => channel * (1 - warm) + warmInk[index] * warm);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const px = x / side, py = y / side;
        let field = .8 * Math.exp(-((px - .5) ** 2 + (py - .5) ** 2) / .025);
        for (const lobe of lobes) field += .65 * Math.exp(-((px - lobe.x) ** 2 + (py - lobe.y) ** 2) / (2 * lobe.radius ** 2));
        const inside = Math.min(1, Math.max(0, (field - .28) / .42));
        const membrane = Math.exp(-(((field - .34) / .065) ** 2)) * .62;
        const density = Math.min(.88, inside * .25 + membrane);
        const at = (y * side + x) * 4;
        for (let channel = 0; channel < 3; channel++) image.data[at + channel] = background[channel] * (1 - density) + ink[channel] * density;
        image.data[at + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    for (const { x, y, radius, rule } of lobes) {
      for (let i = 0; i < rule.when.length; i++) {
        const angle = i * 2.39996;
        const distance = Math.sqrt(i + 1) * radius * .24;
        context.beginPath();
        context.arc((x + Math.cos(angle) * distance) * side, (y + Math.sin(angle) * distance) * side, Math.max(1, side * .004), 0, Math.PI * 2);
        context.fillStyle = paint.success;
        context.fill();
      }
    }
    for (let i = 0; i < metrics.memorySlots; i++) {
      const angle = i / Math.max(1, metrics.memorySlots) * Math.PI * 2;
      context.beginPath();
      context.arc((.5 + Math.cos(angle) * .052) * side, (.5 + Math.sin(angle) * .052) * side, side * .018, 0, Math.PI * 2);
      context.strokeStyle = paint.warning;
      context.lineWidth = Math.max(1, side * .003);
      context.stroke();
    }
  }, [program, small, paint]);
  return <canvas ref={ref} className="specimen-portrait" role="img" aria-label={`${name}: a structural portrait. Lobes represent rules, grains represent conditions, and inner rings represent used memory slots.`} />;
}
