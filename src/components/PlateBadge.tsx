import { formatPlate } from "@/lib/plate";

const sizes = {
  sm: { box: "h-8 text-base", band: "w-4 text-[8px]", pad: "px-2 tracking-wider" },
  md: { box: "h-10 text-xl", band: "w-5 text-[10px]", pad: "px-3 tracking-widest" },
  lg: { box: "h-14 text-3xl", band: "w-7 text-xs", pad: "px-4 tracking-[0.2em]" },
};

// Imita una placa española: franja azul UE con "E" y fondo blanco.
export function PlateBadge({ plate, size = "md" }: { plate: string; size?: keyof typeof sizes }) {
  const s = sizes[size];
  return (
    <span
      className={`inline-flex select-none items-stretch overflow-hidden rounded-lg border-2 border-neutral-900 bg-white font-mono font-bold text-neutral-900 shadow-sm ${s.box}`}
    >
      <span className={`flex flex-col items-center justify-end bg-[#003399] pb-0.5 font-sans text-white ${s.band}`}>
        <span className="mb-auto mt-0.5 leading-none text-[#ffcc00]">★</span>
        E
      </span>
      <span className={`flex items-center whitespace-nowrap ${s.pad}`}>{formatPlate(plate)}</span>
    </span>
  );
}
