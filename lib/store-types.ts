export type ProductStatus = "draft" | "published" | "archived";
export type OrderStatus =
  | "aguardando_confirmacao"
  | "confirmado"
  | "cancelado";

export type Category = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
};

export type ProductVariant = {
  id: number;
  productId: number;
  size: string;
  color: string;
  sku: string;
  stock: number;
  active: boolean;
};

export type ProductImage = {
  id: number;
  productId: number;
  url: string;
  altText: string;
  sortOrder: number;
};

export type Promotion = {
  id: number;
  productId: number;
  name: string;
  promotionalPrice: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type Product = {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  effectivePrice: number;
  personalizationEnabled: boolean;
  personalizationFee: number;
  featured: boolean;
  status: ProductStatus;
  team: string | null;
  season: string | null;
  variants: ProductVariant[];
  images: ProductImage[];
  promotion: Promotion | null;
  totalStock: number;
};

export type StorefrontData = {
  categories: Category[];
  products: Product[];
  settings: StoreSettings;
};

export type StoreSettings = {
  storeName: string;
  whatsappNumber: string;
  instagramUrl: string;
  city: string;
  deliveryOptions: string[];
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
};

export type OrderItem = {
  id: number;
  productName: string;
  size: string;
  color: string;
  sku: string;
  customName: string;
  customNumber: string;
  quantity: number;
  returnedQuantity: number;
  restockedQuantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type StoreOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  deliveryMethod: string;
  notes: string;
  status: OrderStatus;
  paymentStatus: string;
  subtotal: number;
  total: number;
  inventoryDeductedAt: string | null;
  reservationExpiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
};

export type AdminData = StorefrontData & {
  allCategories: Category[];
  allProducts: Product[];
  orders: StoreOrder[];
  metrics: {
    products: number;
    pendingOrders: number;
    soldOut: number;
    lowStock: number;
  };
};
