import { notFound } from "next/navigation";
import { CardDetail } from "./card-detail";
import { getCard } from "@/lib/supabase";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCard(parseInt(id));

  if (!card) {
    notFound();
  }

  return <CardDetail card={card} />;
}
