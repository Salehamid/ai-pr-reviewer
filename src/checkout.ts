
type Product = {
  id: string;
  stock: number;
};

const products = new Map<string, Product>([
  ["SKU-001", { id: "SKU-001", stock: 10 }],
]);

async function createOrder(
  productId: string,
  quantity: number
) {
  return { productId, quantity, status: "created" };
}

export async function checkout(
  productId: string,
  quantity: number
) {
  const product = products.get(productId);

  if (!product || product.stock < quantity) {
    throw new Error("Insufficient stock");
  }

  // Simulate an asynchronous operation
  await new Promise(resolve => setTimeout(resolve, 50));

  product.stock -= quantity;

  return createOrder(productId, quantity);
}
