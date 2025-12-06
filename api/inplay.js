export default async function handler(req, res) {
  try {
   
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "❌ Scraping failed", error: err.message });
  }
}