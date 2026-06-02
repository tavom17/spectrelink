export async function GET() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
    const data = await res.json()
    const price = data?.solana?.usd
    return Response.json({ price: Number(price) })
  } catch {
    return Response.json({ price: null }, { status: 500 })
  }
}
