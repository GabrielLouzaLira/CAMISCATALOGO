import { getStorefrontData } from "@/db/store";
import type { StorefrontData } from "@/lib/store-types";
import Storefront from "./storefront";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialData: StorefrontData = {
    categories: [],
    products: [],
    settings: {
      storeName: "Camisa 10",
      whatsappNumber: "5518981296009",
      instagramUrl: "https://www.instagram.com/camisa.10____/",
      city: "Martinópolis-SP",
      deliveryOptions: ["Retirada em Martinópolis", "Entrega a combinar"],
      heroEyebrow: "Martinópolis-SP · Loja de camisetas",
      heroTitle: "Camisetas para todos os estilos.",
      heroSubtitle: "Vista o que representa você.",
    },
  };
  try {
    initialData = await getStorefrontData();
  } catch {
    // A loja vazia continua utilizável enquanto o D1 local ou hospedado é preparado.
  }
  return <Storefront initialData={initialData} />;
}
