# Smoke test — EDITORS.GroupBuddy

Is `EDITORS.GroupBuddy` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**✅ PASS** — 3/3 checks, since 2026-11-12 00:27 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.GroupBuddy](https://github.com/LikeDotAudio/APK.softapp.EDITORS.GroupBuddy.git) | ✅ | HEAD is on origin |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.GroupBuddy/index.html) | ✅ | HTTP 200 |
| app | `OS/Group Buddy` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.GroupBuddy/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.GroupBuddy`

<!-- smoke:sig 1f5285ef7abf since 2026-11-12 00:27 EST -->
