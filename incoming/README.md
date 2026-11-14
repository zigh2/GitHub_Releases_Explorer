# incoming/

**EN —** Drop **one** `.zip` of the whole project here and push (or upload it from the GitHub web UI / phone).
The *Incoming update* workflow then:

1. unpacks the archive safely (no path traversal, no symlinks, size limits),
2. runs a verification build (lint + tests + import check) — **if it fails, nothing is changed**,
3. replaces the project files (never `.git`, `.github`, `incoming`),
4. deletes the zip, commits, tags `v<VERSION>` and publishes the Windows build as a GitHub Release.

Bump the `VERSION` file in every archive; an existing tag is never overwritten.
One-time setup: **Settings → Actions → General → Workflow permissions → Read and write**.

**AR —** ضع **ملف zip واحداً** للمشروع كاملاً هنا ثم ادفعه (أو ارفعه من واجهة GitHub / الموبايل).
يفكّه الـ Action بأمان، ويجري بناء تحقق (فحص + اختبارات)، فإن نجح استبدل ملفات المشروع (عدا `.git` و`.github` و`incoming`)،
ثم يحذف الـ zip ويُنشئ commit ووسم `v<VERSION>` وينشر إصدار ويندوز. غيّر ملف `VERSION` في كل أرشيف.
إعداد لمرة واحدة: **Settings ← Actions ← General ← Workflow permissions ← Read and write**.
