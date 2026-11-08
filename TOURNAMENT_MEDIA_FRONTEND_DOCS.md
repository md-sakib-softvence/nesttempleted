# 📖 Tournament Media Integration Guide for Frontend Developers

এই ডকুমেন্টটি ফ্রন্টএন্ড ডেভেলপারদের জন্য টুর্নামেন্টের নতুন **৬টি স্বাধীন (Independent) মিডিয়া ফিল্ড** ব্যবহার করার সম্পূর্ণ গাইডলাইন।

---

## 🎯 মূল পরিবর্তন ও সুবিধা

পূর্বে `bannerUrl` পরিবর্তন করলে `canvasImage` এবং ফ্যান পাসের ব্যাকগ্রাউন্ড স্বয়ংক্রিয়ভাবে বদলে যেত। 
এখন ব্যাকএন্ডে **৬টি ফিল্ডকে সম্পূর্ণ আলাদা ও স্বাধীন** করা হয়েছে। **একটি ফিল্ড আপডেট করলে অন্য কোনো ফিল্ডের ওপর কোনো প্রভাব পড়বে না।**

---

## 🖼️ ৬টি নতুন ফিল্ড পরিচিতি (Field Mapping)

| ফিল্ডের নাম (Field Name) | প্রকার (Type) | রিকমেন্ডেড সাইজ/রেশিও | ব্যবহারের স্থান (Where to use) |
| :--- | :--- | :--- | :--- |
| **`tournamentLogo`** | File / String (URL) | 1:1 Emblem (e.g., 512x512) | টুর্নামেন্টের অফিসিয়াল লোগো (ম্যাচ কার্ড, ব্র্যাকেট, পাবলিক ভিউ)। |
| **`tournamentBanner`** | File / String (URL) | 16:9 Banner (e.g., 1920x1080) | টুর্নামেন্টের টপ হিরো ব্যানার (Branding & Media, Public Header)। |
| **`primaryOrganization`** | File / String (URL) | PNG / Square | মূল টুর্নামেন্ট অর্গানাইজার বা হোস্টের লোগো। |
| **`secondaryOrganization`** | File / String (URL) | PNG / Square | কো-স্পন্সর বা সেকেন্ডারি অর্গানাইজার পার্টনারের লোগো। |
| **`fanPassLogo`** | File / String (URL) | 1:1 Square | ফ্যান পাস কার্ডের ওপর প্রদর্শিত ডেডিকেটেড লোগো। |
| **`fanPassBg`** | File / String (URL) | 16:9 বা কার্ড রেশিও | ফ্যান পাস কার্ডের পেছনের ডেডিকেটেড ব্যাকগ্রাউন্ড আর্ট। |

---

## 📡 API Endpoints & Usage

নিচের সবকটি এন্ডপয়েন্টেই নতুন ৬টি ফিল্ড পুরোপুরি সমর্থিত:

1. `POST /api/v1/tournaments` (Create Tournament)
2. `PATCH /api/v1/tournaments/:id` (General Tournament Update)
3. `PATCH /api/v1/tournaments/:id/tabs/settings` (Settings Wizard / Branding & Media Tab)
4. `PATCH /api/v1/tournaments/:id/tabs/fan-pass-template` (Fan Pass Template Tab)
5. `PATCH /api/v1/tournaments/:id/tabs/player-card-template` (Player Card Template Tab)

---

## 📤 ১. ফাইল আপলোড (Multipart / Form-Data)

যখন ইউজার লোকাল ডিভাইস থেকে ইমেজ আপলোড করবেন, `FormData`-তে সরাসরি নতুন ফিল্ডের নাম ব্যবহার করুন:

```typescript
const formData = new FormData();

// উদাহরণ: শুধুমাত্র ব্যানার এবং লোগো আপডেট করতে চাইলে
formData.append('tournamentBanner', bannerFile); // File object
formData.append('tournamentLogo', logoFile);     // File object

// অন্যান্য ফিল্ড (প্রয়োজন অনুযায়ী):
// formData.append('primaryOrganization', orgFile);
// formData.append('secondaryOrganization', secondaryOrgFile);
// formData.append('fanPassLogo', fanPassLogoFile);
// formData.append('fanPassBg', fanPassBgFile);

// রিকোয়েস্ট পাঠানো:
await axios.patch(`/api/v1/tournaments/${tournamentId}/tabs/settings`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});
```

> **লক্ষণীয়:** আপনি শুধুমাত্র যে ফিল্ডটি `formData`-তে পাঠাবেন, ব্যাকএন্ডে শুধু সেই ফিল্ডটিই পরিবর্তন হবে। বাকি ফিল্ডগুলোতে আগের ডাটাই অক্ষত থাকবে।

---

## 🔗 ২. সরাসরি URL পাঠানো (JSON Payload)

যদি ফ্রন্টএন্ডে অলরেডি কোনো ইমেজ URL বা S3 কী থাকে, তবে সরাসরি JSON দিয়েও পাঠাতে পারেন:

```http
PATCH /api/v1/tournaments/{tournamentId}/tabs/settings
Content-Type: application/json
```

```json
{
  "tournamentBanner": "https://bucket.s3.amazonaws.com/tournaments/banner-123.webp",
  "tournamentLogo": "https://bucket.s3.amazonaws.com/tournaments/logo-123.png",
  "primaryOrganization": "https://bucket.s3.amazonaws.com/tournaments/org-123.png",
  "secondaryOrganization": "https://bucket.s3.amazonaws.com/tournaments/sec-org-123.png",
  "fanPassLogo": "https://bucket.s3.amazonaws.com/tournaments/fan-logo-123.png",
  "fanPassBg": "https://bucket.s3.amazonaws.com/tournaments/fan-bg-123.webp"
}
```

---

## 📥 ৩. এপিআই রেসপন্স (GET Response)

যেকোনো টুর্নামেন্ট ডিটেইলস বা ট্যাব ফেচ করার সময় (`GET /api/v1/tournaments/:id` বা `GET .../tabs/settings`) রেসপন্সে প্রেসাইনড ভ্যালিড ইমেজ URL পাবেন:

```json
{
  "id": "d1f58451-22df-4f46-97a0-dca...",
  "tournamentName": "LEFC Championship",
  
  "tournamentLogo": "https://s3.amazonaws.com/.../logo.png?AWSAccessKeyId=...",
  "tournamentBanner": "https://s3.amazonaws.com/.../banner.webp?AWSAccessKeyId=...",
  "primaryOrganization": "https://s3.amazonaws.com/.../primary-org.png?AWSAccessKeyId=...",
  "secondaryOrganization": "https://s3.amazonaws.com/.../sec-org.png?AWSAccessKeyId=...",
  "fanPassLogo": "https://s3.amazonaws.com/.../fan-logo.png?AWSAccessKeyId=...",
  "fanPassBg": "https://s3.amazonaws.com/.../fan-bg.webp?AWSAccessKeyId=...",

  // Backward Compatibility (পুরনো কোড যাতে ক্র্যাশ না করে সেজন্য এখনো পাঠানো হয়):
  "bannerUrl": "https://s3.amazonaws.com/.../banner.webp?AWSAccessKeyId=...",
  "logo": "https://s3.amazonaws.com/.../logo.png?AWSAccessKeyId=...",
  "organizerLogo": "https://s3.amazonaws.com/.../primary-org.png?AWSAccessKeyId=..."
}
```

---

## 💡 ফ্রন্টএন্ড ডেভেলপারদের জন্য রেকমেন্ডেশন

1. **স্টেট ভেরিয়েবল আপডেট:**
   ফ্রন্টএন্ডে কনফিউশন দূর করতে স্টেট ভেরিয়েবল এবং ইনপুট ফিল্ডে সরাসরি এই নামগুলো ব্যবহার করুন:
   - `tournamentLogo`
   - `tournamentBanner`
   - `primaryOrganization`
   - `secondaryOrganization`
   - `fanPassLogo`
   - `fanPassBg`

2. **ইন্ডিপেন্ডেন্ট সেভ:**
   `Branding & Media` বা `Fan Pass Template` ফর্মে ইউজারের পরিবর্তনের পর শুধুমাত্র যে ফিল্ডটি বদলানো হয়েছে সেটাই `PATCH`-এ পাঠাতে পারেন। এতে টুর্নামেন্ট ব্যানার পরিবর্তন করলে ফ্যান পাসের ব্যাকগ্রাউন্ডে কোনো প্রভাব পড়বে না।
