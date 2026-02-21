const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

let cachedDb = null;

async function connectDB() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  cachedDb = client.db(process.env.DB_NAME);
  return cachedDb;
}

// Attach DB to every request
app.use(async (req, res, next) => {
  try {
    req.db = await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed: " + err.message });
  }
});


app.get("/", (req, res) => {
  res.json({ status: "News Orbit API is running 🚀" });
});

app.get("/news", async (req, res) => {
  try {
    const { language, country, category, author, startDate, endDate } = req.query;

    const query = {};
    if (language)  query.language = language;
    if (country)   query.country  = country;
    if (category)  query.category = category;
    if (author)    query.creator  = author;
    if (startDate || endDate) {
      query.pubDate = {};
      if (startDate) query.pubDate.$gte = new Date(startDate);
      if (endDate)   query.pubDate.$lte = new Date(endDate);
    }

    const articles = await req.db
      .collection("articles")
      .find(query)
      .sort({ pubDate: -1 })
      .toArray();

    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/news/fetch-latest", async (req, res) => {
  try {
    const response = await axios.get("https://newsdata.io/api/1/latest", {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        language: "en",
      },
    });

    const articles = response.data.results || [];
    const collection = req.db.collection("articles");

    for (const item of articles) {
      await collection.updateOne(
        { article_id: item.article_id },
        {
          $set: {
            ...item,
            pubDate: item.pubDate ? new Date(item.pubDate) : null,
          },
        },
        { upsert: true }
      );
    }

    res.json({
      status: "success",
      message: `${articles.length} articles saved to database.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
