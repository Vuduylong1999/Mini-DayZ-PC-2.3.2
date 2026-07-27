# Mini DayZ+ 2.3.2 - bản PC

Port từ APK `MDZ 2.3.2` (Construct 2 / Cordova) sang PC bằng NW.js, dùng lại
toàn bộ runtime + mod của bản `MDZ 2.1.4 PC`.

Chạy: **`MiniDayZ-2.3.2.exe`**

---

## Cách port

Game là bản export Construct 2, phần `assets/www/` trong APK không phụ thuộc gì
vào Android ngoài `cordova.js` + `plugins/` (không dùng tới trên PC). Việc port
chỉ là ghép nội dung game 2.3.2 lên bộ runtime NW.js của 2.1.4:

1. Copy toàn bộ NW.js runtime + mod từ `MDZ 2.1.4 PC`.
2. Đè nội dung `assets/www/` của APK 2.3.2 lên (data.js, images/, media/, c2runtime.js, l_*.xml).
3. `index.html`: bỏ 2 thẻ script trỏ sai đường dẫn (`keyboard.js`, `keys.js` ở gốc),
   nạp lại đúng `mod/keys.js`, `mod/keyboard.js`, `mod/default_wasd.js`,
   `zoom.js`, `mod/cloudsave.js`.
4. `package.json`: đổi tên app thành `MDZPlus-2.3.2`.

Rác Android không cần để chạy nằm ở `_apk_original/` (classes.dex, res/,
META-INF/, AndroidManifest.xml, và bản `assets/` gốc). Xoá được, không ảnh hưởng.

> Lưu ý: đổi tên app trong `package.json` cũng đổi thư mục profile của NW.js sang
> `%LOCALAPPDATA%\MDZPlus-2.3.2`. Save của bản 2.1.4 nằm ở profile riêng, không
> đè lên nhau. Save 2.3.2 lần đầu được lấy từ `save-2.3.1.json` qua cloud save.

## Runtime NW.js không nằm trong git

Repo chỉ chứa phần game (**46 MB / 2418 file**). Toàn bộ runtime NW.js (~400 MB)
bị `.gitignore` bỏ qua. Sau khi clone về máy mới, chạy 1 lần:

```powershell
powershell -ExecutionPolicy Bypass -File .\get-runtime.ps1
```

Script tải `nwjs-sdk-v0.81.0-win-x64.zip` (164 MB) về `cache/`, giải nén, copy vào
thư mục game và đổi `nw.exe` → `MiniDayZ-2.3.2.exe`. Có sẵn zip thì bỏ vào `cache/`
trước, script tự dùng lại. Tải tay: <https://dl.nwjs.io/v0.81.0/nwjs-sdk-v0.81.0-win-x64.zip>

**Phải là bản SDK**, không phải bản `normal` — F9 trong game gọi
`nw.Window.showDevTools()`, chỉ bản SDK mới có DevTools.

Những gì thuộc runtime (đã đối chiếu từng byte với zip chính thức: 97/97 file khớp):

| | |
|---|---|
| `*.dll` | `nw.dll` (196 MB), `node.dll`, `libGLESv2.dll`, `vulkan-1.dll`, `vk_swiftshader.dll`, `d3dcompiler_47.dll`, `ffmpeg.dll`, `libEGL.dll`, `nw_elf.dll` |
| `*.exe` | `MiniDayZ-2.3.2.exe` (= `nw.exe`), `nwjc.exe`, `chromedriver.exe`, `notification_helper.exe` |
| `*.pak` | `resources.pak`, `nw_100_percent.pak`, `nw_200_percent.pak` |
| thư mục | `locales/` (91 MB), `pnacl/` (33 MB), `swiftshader/` (3 MB) |
| khác | `icudtl.dat`, `v8_context_snapshot.bin`, `nacl_irt_x86_64.nexe`, `credits.html`, `vk_swiftshader_icd.json` |

`vulkan-1.dll` + `vk_swiftshader.dll` + `swiftshader/` là bộ **render bằng phần mềm**
của Chromium (dùng khi máy không có GPU/driver hỏng) — của NW.js, không phải của game.

## Phím

| Hành động | Phím |
|---|---|
| Di chuyển | WASD (ép mặc định bởi `mod/default_wasd.js`) |
| Bắn | **Chuột phải** (tự nhắm địch gần nhất) |
| Ngắm | Space |
| Reload | R |
| Nhặt đồ | E hoặc F |
| Túi đồ | Tab |
| Đổi vũ khí | Q |
| Đổi loại vũ khí | C |
| Guide | Z |
| Menu (bật/tắt) | Esc |
| Zoom | `=` / `-` |
| Toàn màn hình | F11 |
| DevTools | F9 |
| Hiệu chỉnh lại nút bắn | F10 |

Đổi phím trong `mod/keys.js`. Nếu bắn/ngắm bị lệch sau khi đổi tỉ lệ khung hình:
bấm F10 (nút bắn) hoặc gõ `CALIBRATE("aim")` / `CALIBRATE("guide")` /
`CALIBRATE("switchWpType")` trong console rồi click chuột trái đúng vào nút đó.

## Cloud save (git)

`mod/cloudsave.js` đồng bộ save qua repo git ở thư mục `cloudsave/`
(`Vuduylong1999/Mini-DayZ-PC-save`), file `save-2.3.2.json`.

- **Mở game**: `git fetch` → đồng bộ về đúng bản trên remote → nếu save trên git
  mới hơn máy này thì nạp vào IndexedDB/localStorage rồi reload 1 lần.
- **Tắt game** (bấm X): export toàn bộ save → ghi file → commit → push.
- Push bị từ chối (máy kia đẩy trước): tự fetch, ghi đè bản của mình lên trên
  (last-writer-wins), thử lại tối đa 2 lần.
- Mất mạng lúc tắt: commit vẫn nằm ở local, **lần mở game sau tự đẩy nốt** rồi
  mới kéo về — không bao giờ `reset --hard` đè lên save chưa đẩy.
- Lần đầu chưa có `save-2.3.2.json` thì lấy `save-2.3.1.json` (rồi `save-2.1.4.json`)
  làm gốc, xem `SEED_FROM` trong file.

Lệnh gọi tay trong DevTools (F9):

```js
cloudSaveInfo()      // xem repo, đường dẫn, thời điểm save của máy này
cloudSavePushNow()   // đẩy ngay không cần tắt game
cloudSavePullNow()   // kéo bản mới nhất về + reload
```

Bật autosave nền: sửa `AUTOSAVE_MINUTES` trong `mod/cloudsave.js` (mặc định 0 = tắt).

## Event ID của mod bàn phím

`mod/keyboard.js` gọi thẳng event trong event sheet. Bản 2.3.2 chèn thêm 1 event
ở page 0 nên **RELOAD dịch từ idx 95 → 96**; các event khác giữ nguyên.

Để không phải dò lại mỗi lần lên đời, `triggerEvent()` giờ tra theo **sid**
(field `.Ba`, ID cố định do Construct 2 sinh), chỉ dùng index cũ làm dự phòng.
Bảng sid + cách dò lại: xem `mod/EVENT-IDS.txt`.
