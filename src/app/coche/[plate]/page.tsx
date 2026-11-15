import { Suspense } from "react";
import { CarView } from "@/components/CarView";

async function Content({ params }: { params: PageProps<"/coche/[plate]">["params"] }) {
  const { plate } = await params;
  return <CarView plate={decodeURIComponent(plate)} />;
}

export default function CarPage({ params }: PageProps<"/coche/[plate]">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}
