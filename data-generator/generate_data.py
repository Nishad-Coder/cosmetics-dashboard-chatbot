"""
Cosmetics Company Advertisement Data Generator
Generates 1000 samples of competitor advertisement data for analysis.
"""

import csv
import random
import os
from datetime import datetime, timedelta

# Configuration
NUM_SAMPLES = 1000
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "cosmetics_ads.csv")

# Data pools
BRANDS = [
    "L'Oreal", "Estee Lauder", "Procter & Gamble", "Coty", "Shiseido",
    "Avon", "Revlon", "Mary Kay", "Oriflame", "Yves Rocher",
    "Clinique", "Lancome", "MAC", "NYX", "Maybelline",
    "Neutrogena", "Olay", "Garnier", "Nivea", "Dove",
    "Chanel", "Dior", "Guerlain", "Givenchy", "YSL",
    "Benefit", "Too Faced", "Tarte", "Anastasia Beverly Hills", "Huda Beauty"
]

PRODUCT_CATEGORIES = [
    "Skincare", "Makeup", "Haircare", "Fragrance", "Personal Care",
    "Anti-Aging", "Sun Care", "Men's Grooming", "Organic/Natural", "Premium/Luxury"
]

AD_PLATFORMS = [
    "Instagram", "Facebook", "Google Ads", "TikTok", "YouTube",
    "Twitter/X", "Pinterest", "Snapchat", "LinkedIn", "Programmatic Display"
]

AD_FORMATS = [
    "Video", "Carousel", "Single Image", "Story", "Banner",
    "Collection", "Reels", "In-Feed", "Search", "Native"
]

TARGET_AUDIENCES = [
    "Women 18-24", "Women 25-34", "Women 35-44", "Women 45-54", "Women 55+",
    "Men 18-24", "Men 25-34", "Men 35-44", "Men 45-54", "Men 55+",
    "Teens", "Young Adults", "Professionals", "Parents", "Seniors"
]

REGIONS = [
    "North America", "Europe", "Asia Pacific", "Latin America", "Middle East",
    "Africa", "Oceania", "Eastern Europe", "Southeast Asia", "Central America"
]

CAMPAIGN_TYPES = [
    "Brand Awareness", "Product Launch", "Seasonal Promotion", "Retargeting",
    "Lookalike Audience", "Influencer Collaboration", "Flash Sale", "Loyalty Program",
    "New Customer Acquisition", "Cart Abandonment"
]

DEVICES = ["Mobile", "Desktop", "Tablet", "Connected TV"]
SEASONS = ["Spring", "Summer", "Fall", "Winter", "Holiday", "Back to School", "Valentine's Day", "Black Friday"]


def generate_campaign_id(index):
    """Generate a unique campaign ID."""
    return f"CAMP-{2024}-{index:05d}"


def generate_date():
    """Generate a random date within the last 12 months."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    random_days = random.randint(0, 365)
    return (start_date + timedelta(days=random_days)).strftime("%Y-%m-%d")


def generate_metrics():
    """Generate realistic advertising metrics with correlations."""
    # Base impressions (log-normal distribution for realism)
    impressions = int(random.lognormvariate(12, 1.5))
    impressions = max(1000, min(impressions, 50000000))

    # CTR varies by platform and format (0.5% to 8%)
    base_ctr = random.uniform(0.005, 0.08)
    ctr = max(0.001, min(base_ctr, 0.15))

    clicks = int(impressions * ctr)

    # CPC varies by platform ($0.10 to $5.00)
    cpc = random.uniform(0.10, 5.00)
    spend = round(clicks * cpc, 2)

    # Conversion rate (1% to 15% of clicks)
    conversion_rate = random.uniform(0.01, 0.15)
    conversions = int(clicks * conversion_rate)

    # Revenue generated (conversions * average order value)
    aov = random.uniform(25, 350)
    revenue = round(conversions * aov, 2)

    # ROAS (Return on Ad Spend)
    roas = round(revenue / spend, 2) if spend > 0 else 0

    # CPM (Cost per 1000 impressions)
    cpm = round((spend / impressions) * 1000, 2) if impressions > 0 else 0

    # Engagement rate (for social platforms)
    engagement_rate = round(random.uniform(0.5, 12.0), 2)

    # Video completion rate (for video ads)
    video_completion_rate = round(random.uniform(15, 85), 2) if random.random() > 0.3 else 0

    # Bounce rate
    bounce_rate = round(random.uniform(20, 80), 2)

    # Average session duration (seconds)
    avg_session_duration = round(random.uniform(30, 300), 2)

    return {
        "impressions": impressions,
        "clicks": clicks,
        "ctr": round(ctr * 100, 2),
        "spend": spend,
        "conversions": conversions,
        "conversion_rate": round(conversion_rate * 100, 2),
        "revenue": revenue,
        "roas": roas,
        "cpm": cpm,
        "cpc": round(cpc, 2),
        "engagement_rate": engagement_rate,
        "video_completion_rate": video_completion_rate,
        "bounce_rate": bounce_rate,
        "avg_session_duration": avg_session_duration,
    }


def generate_row(index):
    """Generate a single row of advertisement data."""
    metrics = generate_metrics()

    return {
        "campaign_id": generate_campaign_id(index),
        "brand": random.choice(BRANDS),
        "product_category": random.choice(PRODUCT_CATEGORIES),
        "ad_platform": random.choice(AD_PLATFORMS),
        "ad_format": random.choice(AD_FORMATS),
        "target_audience": random.choice(TARGET_AUDIENCES),
        "region": random.choice(REGIONS),
        "campaign_type": random.choice(CAMPAIGN_TYPES),
        "device": random.choice(DEVICES),
        "season": random.choice(SEASONS),
        "date": generate_date(),
        **metrics,
    }


def main():
    """Main function to generate the CSV file."""
    print(f"Generating {NUM_SAMPLES} samples of cosmetics advertisement data...")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    # Define CSV headers
    headers = [
        "campaign_id", "brand", "product_category", "ad_platform", "ad_format",
        "target_audience", "region", "campaign_type", "device", "season", "date",
        "impressions", "clicks", "ctr", "spend", "conversions", "conversion_rate",
        "revenue", "roas", "cpm", "cpc", "engagement_rate",
        "video_completion_rate", "bounce_rate", "avg_session_duration"
    ]

    # Generate and write data
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()

        for i in range(1, NUM_SAMPLES + 1):
            row = generate_row(i)
            writer.writerow(row)

            if i % 100 == 0:
                print(f"  Generated {i}/{NUM_SAMPLES} records...")

    print(f"\nData generation complete!")
    print(f"Output file: {os.path.abspath(OUTPUT_FILE)}")
    print(f"Total records: {NUM_SAMPLES}")


if __name__ == "__main__":
    main()
