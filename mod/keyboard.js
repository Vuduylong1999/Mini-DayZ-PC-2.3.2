/* ============================================================
   MiniDayZ PC - Keyboard function keys
   Nạp SAU mod/keys.js (cần biến GAME_KEYS) và SAU zoom.js (cần applyGameZoom)
   ============================================================ */

// Lấy runtime của Construct 2 một cách an toàn (lazy: chỉ gọi khi đã load xong)
function getRT() {
	if (window.runtSCRIPT) return window.runtSCRIPT;
	if (typeof cr_getC2Runtime !== "undefined") {
		var rt = cr_getC2Runtime();
		if (rt) window.runtSCRIPT = rt; // cache lại
		return rt;
	}
	return null;
}

/* Gọi 1 action trong event sheet theo đường dẫn obfuscated.
   page = 0 hoặc 1 (Ly['t495'][page]).
   sid  = ID CỐ ĐỊNH của event (field .Ba) - do Construct 2 sinh ra, KHÔNG đổi khi
          tác giả thêm/bớt event khác. Tra theo sid nên lên đời bản mới không lệch.
   idx  = chỉ số cũ, chỉ dùng làm dự phòng nếu không tìm thấy sid.
   Bọc try/catch để nếu lệch thì không crash, chỉ cảnh báo. */
var __evCache = {};
function triggerEvent(name, page, sid, idx) {
	try {
		var rt = getRT();
		if (!rt) { console.warn("[keys] runtime chưa sẵn sàng cho:", name); return; }
		var handlers = rt.Hr.Game_events.Ly['t495'];
		var entry = handlers && handlers[page];
		var zk = entry && entry.Zk;
		if (!zk) { console.warn("[keys] không đọc được event sheet cho:", name); return; }

		var ev = __evCache[name];
		if (!ev) {
			// Tìm theo sid trước.
			for (var i = 0; i < zk.length; i++) {
				var a = zk[i];
				if (a && a[0] && a[0].Ba === sid) { ev = a[0]; break; }
			}
			// Không thấy -> dùng index cũ.
			if (!ev && zk[idx] && zk[idx][0]) {
				ev = zk[idx][0];
				console.warn("[keys] '" + name + "': không thấy sid " + sid + ", dùng tạm idx " + idx +
					" (sid thực tế = " + ev.Ba + "). Nên cập nhật lại sid trong mod/keyboard.js.");
			}
			if (!ev) {
				console.warn("[keys] KHÔNG TÌM THẤY event '" + name + "' (page=" + page + ", sid=" + sid + ", idx=" + idx + ")");
				return;
			}
			__evCache[name] = ev;
		}
		ev.VG();
	} catch (err) {
		console.error("[keys] LỖI khi gọi '" + name + "' (page " + page + ", sid " + sid + "):", err);
	}
}

/* ---------- Bắn/ngắm/guide: giả lập click THẬT vào nút tương ứng trên UI ----------
   Lý do: mấy nút này khi gọi thẳng event nội bộ (triggerEvent page/idx) không ổn định
   (vd nút bắn: mỗi loại vũ khí dùng 1 event khác nhau -> gọi sai idx thì im re dù
   bấm tay vào nút vẫn chạy bình thường). Nên thay vì đoán page/idx, ta giả lập đúng
   thao tác bấm tay: mousedown + mouseup (giữ ngắn ~10ms) tại đúng toạ độ nút đó trên
   canvas - đi qua pipeline xử lý gốc của game nên luôn đúng, không phụ thuộc
   page/idx/loại vũ khí nữa.

   UI_BUTTONS lưu toạ độ tỉ lệ 0..1 theo canvas (không phụ thuộc kích thước cửa sổ khi
   giữ nguyên tỉ lệ khung hình) cho từng nút, theo tên.
   Nếu đổi tỉ lệ khung hình (kéo méo cửa sổ, bật/tắt fullscreen...) mà thấy 1 nút nào
   đó bắn lệch/không trúng, gõ CALIBRATE("tên_nút") trong console rồi CLICK CHUỘT
   TRÁI đúng vào nút đó trên màn hình 1 lần để hiệu chỉnh lại - lưu vào localStorage,
   không cần sửa code, giữ nguyên cho các lần chơi sau. F10 = hiệu chỉnh nhanh nút bắn. */
var UI_BUTTONS = {
	attack:      { x: 0.9552, y: 0.6165 },
	aim:         { x: 0.9075520833333334, y: 0.6539351851851852 },
	guide:       { x: 0.9830729166666666, y: 0.16666666666666666 },
	switchWpType:{ x: 0.9127604166666666, y: 0.9363425925925926 }
};
var calibratingButtonName = null;

function loadUIButtonPositions() {
	try {
		var raw = localStorage.getItem("mdz_ui_button_pos");
		if (!raw) return;
		var saved = JSON.parse(raw);
		for (var name in saved) {
			if (Object.prototype.hasOwnProperty.call(saved, name) &&
				typeof saved[name].x === "number" && typeof saved[name].y === "number") {
				UI_BUTTONS[name] = saved[name];
			}
		}
	} catch (err) { /* ignore, dùng mặc định */ }
}
loadUIButtonPositions();

function saveUIButtonPositions() {
	try { localStorage.setItem("mdz_ui_button_pos", JSON.stringify(UI_BUTTONS)); } catch (err) { /* ignore */ }
}

function simulateCanvasClick(relX, relY, holdMs) {
	var canvas = document.getElementById("c2canvas");
	if (!canvas) { console.warn("[keys] không tìm thấy canvas #c2canvas"); return; }
	var rect = canvas.getBoundingClientRect();
	var x = rect.left + rect.width * relX;
	var y = rect.top + rect.height * relY;
	var downOpts = { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1, view: window };
	var upOpts   = { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 0, view: window };
	canvas.dispatchEvent(new MouseEvent("mousedown", downOpts));
	setTimeout(function () {
		canvas.dispatchEvent(new MouseEvent("mouseup", upOpts));
	}, (typeof holdMs === "number") ? holdMs : 10);
}

// Bấm 1 nút UI theo tên đã đăng ký trong UI_BUTTONS.
function clickUIButton(name, holdMs) {
	var pos = UI_BUTTONS[name];
	if (!pos) { console.warn("[keys] chưa có toạ độ cho nút '" + name + "', dùng CALIBRATE('" + name + "') để set."); return; }
	simulateCanvasClick(pos.x, pos.y, holdMs);
}

// Gõ CALIBRATE("attack") / CALIBRATE("aim") / CALIBRATE("guide") ... trong console
// rồi click chuột trái đúng vào nút đó trên màn hình để lưu/hiệu chỉnh lại toạ độ.
function CALIBRATE(name) {
	calibratingButtonName = name;
	console.log("[keys] Chế độ hiệu chỉnh nút '" + name + "': CLICK CHUỘT TRÁI đúng vào nút đó trên màn hình.");
}
window.CALIBRATE = CALIBRATE;

/* sid lấy từ chính bản 2.3.2 (đã đối chiếu với 2.1.4 - xem mod/EVENT-IDS.txt).
   Bản 2.3.2 chèn thêm 1 event ở page 0 idx 82 nên RELOAD dịch 95 -> 96;
   các event còn lại giữ nguyên vị trí. */
function RELOAD_INTER()    { triggerEvent("RELOAD",        0, 8302300112826202, 96); }
function PAD_INTER()       { triggerEvent("PAD_PAGE",      0, 607427199268123,  31); }
function TAKE_I_INTER()    { triggerEvent("TAKE_ITENS",    1, 8880091309135125, 6);  }
function ATTACK_INTER()       { clickUIButton("attack", 10); }
function AIM_INTER()          { clickUIButton("aim", 10); }
function GUIDE_INTER()        { clickUIButton("guide", 10); }
function SWITCH_WP_TYPE_INTER(){ clickUIButton("switchWpType", 10); }
function SWICTH_WP_INTER()    { triggerEvent("SWITCH_WEAPON", 1, 6889675909831562, 9);  }
function INVENTORY_INTER()    { triggerEvent("INVENTORY",     1, 787240265571276,  8);  }

// Trạng thái menu để Esc bấm lần nữa thì ĐÓNG, và để chuột không bắn khi đang ở menu.
var menuOpen = false;
function PAUSE_INTER() {
	try {
		if (!menuOpen) {
			c2_callFunction("options");          // mở pause menu
			menuOpen = true;
		} else {
			c2_callFunction("clear_pause_menu");  // = bấm Resume, đóng menu
			menuOpen = false;
		}
	} catch (err) { console.error("[keys] LỖI menu:", err); }
}

// Toggle toàn màn hình qua NW.js API
function FULLSCREEN_TOGGLE() {
	try {
		var win = nw.Window.get();
		win.toggleFullscreen();
	} catch (err) {
		console.error("[keys] LỖI fullscreen:", err);
	}
}

// Bỏ qua phím khi đang gõ vào ô input/textarea (nếu có)
function isTyping(e) {
	var t = e.target;
	return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

document.addEventListener("keyup", function (e) {
	if (isTyping(e)) return;
	var code = e.code.toLowerCase();
	switch (code) {
		case GAME_KEYS.RELOAD.toLowerCase():        RELOAD_INTER();    break;
		case GAME_KEYS.SWITCH_WP_TYPE.toLowerCase(): SWITCH_WP_TYPE_INTER(); break;
		case GAME_KEYS.OPTIONS_MENU.toLowerCase():  PAUSE_INTER();     break;
		case GAME_KEYS.INVENTORY.toLowerCase():     INVENTORY_INTER(); break;
		case GAME_KEYS.SWITCH_WEAPON.toLowerCase(): SWICTH_WP_INTER(); break;
		case GAME_KEYS.AIM.toLowerCase():           AIM_INTER();       break;
		case GAME_KEYS.GUIDE.toLowerCase():         GUIDE_INTER();     break;
		default:
			// Nhặt đồ: E hoặc F
			if (code === GAME_KEYS.TAKE_ITENS.toLowerCase() ||
			    code === GAME_KEYS.TAKE_ITENS_ALT.toLowerCase()) {
				TAKE_I_INTER();
			}
	}
});

document.addEventListener("keydown", function (e) {
	if (isTyping(e)) return;
	var code = e.code.toLowerCase();
	// Tab mặc định chuyển focus -> chặn lại để không thoát khỏi game
	if (code === GAME_KEYS.INVENTORY.toLowerCase()) e.preventDefault();
	// F11 mặc định của trình duyệt/NW sẽ bị chặn để tự xử lý
	if (code === GAME_KEYS.FULLSCREEN.toLowerCase()) e.preventDefault();
	switch (code) {
		// Zoom dùng trực tiếp applyGameZoom() từ zoom.js gốc (giữ khi nhấn = zoom liên tục)
		case GAME_KEYS.ZOOM_IN.toLowerCase():
			if (typeof applyGameZoom === "function") applyGameZoom(0.1);
			break;
		case GAME_KEYS.ZOOM_OUT.toLowerCase():
			if (typeof applyGameZoom === "function") applyGameZoom(-0.1);
			break;
		case GAME_KEYS.FULLSCREEN.toLowerCase():
			FULLSCREEN_TOGGLE();
			break;
	}
});

/* ---------- CHUỘT: phải = bắn (trái tắt) ---------- */
// Chặn menu chuột phải của trình duyệt/NW
document.addEventListener("contextmenu", function (e) { e.preventDefault(); });

document.addEventListener("mousedown", function (e) {
	if (isTyping(e)) return;
	if (calibratingButtonName) {
		if (e.button !== 0) return; // chỉ nhận chuột trái lúc hiệu chỉnh
		e.preventDefault();
		var name = calibratingButtonName;
		calibratingButtonName = null;
		var canvas = document.getElementById("c2canvas");
		if (!canvas) { console.warn("[keys] không tìm thấy canvas #c2canvas"); return; }
		var rect = canvas.getBoundingClientRect();
		UI_BUTTONS[name] = {
			x: (e.clientX - rect.left) / rect.width,
			y: (e.clientY - rect.top) / rect.height
		};
		saveUIButtonPositions();
		console.log("[keys] Đã hiệu chỉnh lại nút '" + name + "': x=" + UI_BUTTONS[name].x.toFixed(4) + " y=" + UI_BUTTONS[name].y.toFixed(4));
		return;
	}
	if (e.button === 0 && MOUSE_KEYS.LEFT_SHOOT) {
		ATTACK_INTER(); // chuột trái = bắn (mặc định tắt)
	} else if (e.button === 2 && MOUSE_KEYS.RIGHT_SHOOT) {
		e.preventDefault();
		ATTACK_INTER(); // chuột phải = bắn
	}
});

document.addEventListener("keyup", function (e) {
	if (isTyping(e)) return;
	if (e.code === "F10") {
		CALIBRATE("attack");
	}
});

/* ---------- DEBUG: dò toạ độ nút UI trên canvas (giữ lại phòng khi cần dò nút khác) ----------
   F9                                  -> mở DevTools
   DEBUG_CAPTURE_ATTACK_POS()          -> di chuột vào giữa 1 nút trên UI rồi gõ lệnh này,
                                          in ra toạ độ tỉ lệ x,y (0..1) của vị trí chuột hiện tại
   DEBUG_CLICK_AT(relX, relY, holdMs)  -> giả lập click (giữ holdMs, mặc định 150ms) tại toạ độ đó */
var __lastMouseEvt = null;
document.addEventListener("mousemove", function (e) { __lastMouseEvt = e; });

function DEBUG_CAPTURE_ATTACK_POS() {
	if (!__lastMouseEvt) { console.warn("[debug] chưa có toạ độ chuột, di chuột trước rồi thử lại"); return; }
	var canvas = document.getElementById("c2canvas");
	if (!canvas) { console.warn("[debug] không tìm thấy canvas #c2canvas"); return; }
	var rect = canvas.getBoundingClientRect();
	var relX = (__lastMouseEvt.clientX - rect.left) / rect.width;
	var relY = (__lastMouseEvt.clientY - rect.top) / rect.height;
	console.log("[debug] toạ độ tỉ lệ hiện tại: x=" + relX.toFixed(4) + " y=" + relY.toFixed(4));
	return { x: relX, y: relY };
}

function DEBUG_CLICK_AT(relX, relY, holdMs) {
	simulateCanvasClick(relX, relY, (typeof holdMs === "number") ? holdMs : 150);
}

window.DEBUG_CAPTURE_ATTACK_POS = DEBUG_CAPTURE_ATTACK_POS;
window.DEBUG_CLICK_AT = DEBUG_CLICK_AT;

document.addEventListener("keyup", function (e) {
	if (isTyping(e)) return;
	if (e.code === "F9") {
		try { nw.Window.get().showDevTools(); } catch (err) { console.error("[debug] không mở được DevTools:", err); }
	}
});

console.log("[keys] Đã nạp. Chuột phải=bắn (tự nhắm địch gần nhất) |",
	"R=reload, E/F=nhặt đồ, Tab=túi đồ, Q=đổi vũ khí, C=đổi loại vũ khí, Space=ngắm bắn, Z=guide,",
	"Esc=menu(bật/tắt), +/-=zoom, F11=toàn màn hình,",
	"F10=hiệu chỉnh lại vị trí nút bắn, CALIBRATE(\"tên_nút\")=hiệu chỉnh nút khác (dùng khi đổi tỉ lệ khung hình mà bắn/ngắm lệch)");
