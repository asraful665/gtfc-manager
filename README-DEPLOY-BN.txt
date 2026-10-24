GTFC Manager — Render starter package

ফাইলে আছে: index.html, server.js, package.json, render.yaml।

গুরুত্বপূর্ণ সীমাবদ্ধতা:
১) Render Free সার্ভার নিষ্ক্রিয় থাকলে ঘুমিয়ে যেতে পারে; ২৪/৭ নিশ্চয়তা নেই।
২) বর্তমান server.js খেলোয়াড়দের তথ্য club-data.json ফাইলে রাখে। ফ্রি হোস্টিংয়ে এই ফাইল স্থায়ী নাও হতে পারে; redeploy/restart করলে ডেটা হারানোর ঝুঁকি আছে। স্থায়ী database যোগ ও পরীক্ষা না করা পর্যন্ত আসল ডেটা যোগ কোরো না।
৩) কোনো config.json বা পাসওয়ার্ড ZIP-এ রাখা হয়নি। Render-এর Environment settings-এ OWNER_PASSWORD এবং VIEWER_PASSWORD আলাদা secret হিসেবে সেট করতে হবে।
৪) গোপন পাসওয়ার্ড public GitHub repository-তে আপলোড কোরো না।

শুরু করার নিয়ম:
১) ZIP খুলে ফাইলগুলো GitHub repository-এর root-এ আপলোড করো।
২) Render-এ New + > Blueprint থেকে repository connect করো।
৩) Deploy-এর পর Environment-এ OWNER_PASSWORD ও VIEWER_PASSWORD সেট করো।
৪) বাস্তব খেলোয়াড়ের ডেটা যোগ করার আগে persistent database যোগ করতে হবে।

এই প্যাকেজটি প্রাথমিক deployment starter—স্থায়ী ডেটা সংরক্ষণসহ সম্পূর্ণ production-ready নয়।
