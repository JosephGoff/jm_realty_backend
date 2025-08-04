const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cheerio = require("cheerio");
const cron = require("node-cron");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const nodemailer = require("nodemailer");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

puppeteer.use(StealthPlugin());

const allowedOrigins = [
  "https://joeygoff13.wixstudio.com/jmrealty",
  "https://jmrealtyservices.com",
];

const PROXY_HOST = "geo.iproyal.com";
const PROXY_PORT = "12321";
const PROXY_USER = "ma64tHoi2FXZvTDg";
const PROXY_PASS = "rdoIhYUaLcLkeHKD";

app.use(helmet());
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "joeygoff13@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendErrorEmail(type, error) {
  const mailOptions = {
    from: '"Scraper Bot" <joeygoff13@gmail.com>',
    to: "joeygoff13@gmail.com",
    subject: "JM Scraper Failed",
    text: `The ${type} scraper failed with the following error:\n\n${
      error.stack || error
    }`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("❌ Failed to send error email:", err);
  }
}

const scrapeZipRecruiter = async () => {
  function parseJobs(html) {
    const $ = cheerio.load(html);
    const jobs = [];

    $("article.new_job_item.job_item").each((_, el) => {
      const article = $(el);

      const title = article.find("h2.title").text().trim();
      const company = article.find(".company_name").text().trim();
      const location = article.find(".company_location").text().trim();
      const description = article.find(".job_snippet").text().trim();

      const salary =
        article.find(".perk_item.perk_pay span").text().trim() || "";
      const type =
        article.find(".perk_item.perk_type span").text().trim() || "";

      const link = article.find("a.job_link").attr("href") || "";
      const absoluteLink = link.startsWith("http")
        ? link
        : `https://www.ziprecruiter.com${link}`;

      jobs.push({
        title,
        company,
        location,
        description,
        salary,
        type,
        link: absoluteLink,
      });
    });

    return jobs;
  }

  try {
    const API_KEY = process.env.SCRAPER_API_KEY;
    const TARGET_URL = encodeURIComponent(
      "https://www.ziprecruiter.com/co/J-%26-M-Realty-Services/Jobs"
    );
    const SCRAPER_URL = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${TARGET_URL}`;

    fetch(SCRAPER_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      },
    })
      .then(async (res) => {
        const text = await res.text();
        const jobs = parseJobs(text);
        console.log("FOUND JOBS:", jobs);
        saveData(jobs, "jobs.json");
      })
      .catch((err) => {
        sendErrorEmail("Zip Recruiter", err.message);
        console.error("Scraping failed:", err.message);
      });
  } catch (err) {
    console.error("Scraping failed:", err.message);
  }
};

async function scrapeStreetEasyListings() {
  function parseListings(listingsHTML) {
    try {
      const $ = cheerio.load(listingsHTML);
      const listings = [];

      $("div.styled__ListingCardWrapper-sc-1bxj4tp-0").each((_, el) => {
        const wrapper = $(el);

        const imageUrl = wrapper.find("img").attr("src") || null;

        const price = wrapper
          .find(".styled__ListingPrice-sc-1bxj4tp-4")
          .contents()
          .filter(function () {
            return this.type === "text";
          })
          .text()
          .trim();

        const address = wrapper.find("h3 a").text().trim() || null;

        const beds =
          wrapper
            .find(".styled__BedBathSqftCell-sc-1bxj4tp-8")
            .eq(0)
            .text()
            .replace(/\s+/g, " ")
            .trim() || null;

        const baths =
          wrapper
            .find(".styled__BedBathSqftCell-sc-1bxj4tp-8")
            .eq(1)
            .text()
            .replace(/\s+/g, " ")
            .trim() || null;

        const sqftText = wrapper
          .find(".styled__BedBathSqftCell-vuk9i9-0")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const squareFeetMatch = sqftText.match(/(\d+)/);
        const squareFeet = squareFeetMatch
          ? parseInt(squareFeetMatch[1])
          : null;

        const area =
          wrapper
            .find(".styled__NeighborhoodLink-sc-1bxj4tp-9")
            .text()
            .trim() || null;

        listings.push({
          imageUrl,
          price,
          address,
          beds,
          baths,
          squareFeet,
          area,
        });
      });

      return listings;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=${PROXY_HOST}:${PROXY_PORT}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
    const page = await browser.newPage();
    await page.authenticate({
      username: PROXY_USER,
      password: PROXY_PASS,
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.goto(
      "https://streeteasy.com/profile/957084-daniel-cornicello?tab_profile=active_listings",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await page.waitForSelector('div[data-qa="active-rentals"]', {
      visible: true,
      timeout: 60000,
    });
    const listingsHTML = await page.$eval(
      'div[data-qa="active-rentals"]',
      (el) => el.innerHTML
    );
    const listings = parseListings(listingsHTML);
    console.log("LISTINGS: ", listings);
    if (Array.isArray(listings)) {
      saveData(listings, "listings.json");
    }
    await browser.close();
  } catch (error) {
    await sendErrorEmail("StreetEasy", error);
    console.error(error);
  }
}

cron.schedule(
  "35 1 * * *",
  async () => {
    await scrapeZipRecruiter();
    await scrapeStreetEasyListings();
  },
  {
    timezone: "America/New_York",
  }
);

const saveData = (data, file) => {
  const filePath = path.join(__dirname, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const loadData = (file) => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return [];
};

app.get("/jobs", (req, res) => {
  const data = loadData("jobs.json");
  res.json(data);
});

app.get("/listings", (req, res) => {
  const data = loadData("listings.json");
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
