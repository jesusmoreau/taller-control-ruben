import { formatPlate } from "@/lib/plate";

// Imita una placa española: franja azul con "E" a la izquierda.
export function PlateBadge({ plate, large = false }: { plate: string; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-stretch overflow-hidden rounded-md border-2 border-neutral-800 bg-white font-mono font-bold text-neutral-900 ${
        large ? "text-3xl" : "text-lg"
      }`}
    >
      <span className={`flex items-end bg-blue-700 px-1 pb-0.5 text-white ${large ? "text-sm" : "text-[10px]"}`}>
        E
      </span>
      <span className={large ? "px-3 py-1 tracking-widest" : "px-2 tracking-wider"}>{formatPlate(plate)}</span>
    </span>
  );
}
