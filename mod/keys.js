//Do not modify this part!
var KEYS = {
	//Alpha keys 	|   Especial keys
	KEY_A : "KeyA",		KEY_ENTER			: "ENTER",				KEY_0 : "Digit0",
	KEY_B : "KeyB",		KEY_BACKSPACE		: "BACKSPACE",			KEY_1 : "Digit1",
	KEY_C : "KeyC",		KEY_CTRL_LEFT		: "ControlLeft",		KEY_2 : "Digit2",
	KEY_D : "KeyD",		KEY_CTRL_RIGHT		: "ControlRight",		KEY_3 : "Digit3",
	KEY_E : "KeyE",		KEY_SPACE			: "Space",				KEY_4 : "Digit4",
	KEY_F : "KeyF",		KEY_ALT_LEFT		: "AltLeft",			KEY_5 : "Digit5",
	KEY_G : "KeyG",		KEY_ALT_RIGHT		: "AltRight",			KEY_6 : "Digit6",
	KEY_H : "KeyH",		KEY_SHIFT_LEFT		: "ShiftLeft",			KEY_7 : "Digit7",
	KEY_I : "KeyI",		KEY_SHIFT_RIGHT		: "ShiftRight",			KEY_8 : "Digit8",
	KEY_J : "KeyJ",		KEY_ARROW_UP		: "ArrowUp",			KEY_9 : "Digit9",
	KEY_K : "KeyK",		KEY_ARROW_DOWN		: "ArrowDown",			KEY_ESCAPE: "Escape",
	KEY_L : "KeyL",		KEY_ARROW_LEFT		: "ArrowLeft",
	KEY_M : "KeyM",		KEY_ARROW_RIGHT		: "ArrowRight",
	KEY_N : "keyN",		KEY_DELETE			: "Delete",
	KEY_O : "KeyO",		KEY_MINUS			: "Minus",
	KEY_P : "KeyP",		KEY_EQUAL			: "Equal",
	KEY_Q : "KeyQ",		KEY_CAPSLOCK		: "CapsLock",
	KEY_R : "KeyR",		KEY_TAB				: "Tab",
	KEY_S : "KeyS",		KEY_BACKQUOTE		: "Backquote",
	KEY_T : "KeyT",		KEY_INTLRO			: "IntlRo",
	KEY_U : "KeyU",		KEY_CONTEXTMENU		: "ContextMenu",
	KEY_V : "KeyV",		KEY_SLASH			: "Slash",
	KEY_W : "KeyW",		KEY_COMMA			: "Comma",
	KEY_X : "KeyX",		KEY_PERIOD			: "Period",
	KEY_Y : "KeyY",		KEY_METALEFT		: "MetaLeft",
	KEY_Z : "KeyZ",		KEY_METARIGHT		: "MetaRight",
						KEY_F8				: "F8",
						KEY_F11				: "F11",
}

//Modify here!  (đổi phím ở đây, dùng tên từ bảng KEYS phía trên)
var GAME_KEYS = {
	RELOAD 			: KEYS.KEY_R,
	SWITCH_WP_TYPE	: KEYS.KEY_C,			// đổi loại vũ khí (thế chỗ PAD_PAGE cũ)
	TAKE_ITENS 		: KEYS.KEY_E,			// nhặt đồ: E hoặc F
	TAKE_ITENS_ALT	: KEYS.KEY_F,
	OPTIONS_MENU 	: KEYS.KEY_ESCAPE,
	INVENTORY		: KEYS.KEY_TAB,			// túi đồ: Tab
	SWITCH_WEAPON   : KEYS.KEY_Q,
	ZOOM_IN			: KEYS.KEY_EQUAL,
	ZOOM_OUT		: KEYS.KEY_MINUS,
	FULLSCREEN		: KEYS.KEY_F11,		// F11 = bật/tắt toàn màn hình
	AIM				: KEYS.KEY_SPACE,	// ngắm bắn (toggle bật/tắt)
	GUIDE			: KEYS.KEY_Z,		// guide (toggle bật/tắt)
	ATTACK_MODE		: KEYS.KEY_F8		// đổi cách gửi lệnh bắn (canvas <-> event)
	// (bắn chỉ bằng CHUỘT PHẢI, xem MOUSE_KEYS bên dưới)
}

// Chuột: phải = bắn. true để bật, false để tắt.
var MOUSE_KEYS = {
	LEFT_SHOOT		: false,	// chuột trái: tắt
	RIGHT_SHOOT		: true		// chuột phải = bắn
}

/* Cách gửi lệnh BẮN. Mỗi lần bấm chỉ chạy 1 trong 2 đường -> luôn đúng 1 viên.
     "canvas" = giả lập click vào nút bắn trên UI.
                + Chạy với MỌI vũ khí, kể cả súng vừa mới nhặt lên.
                - KHÔNG bắn được trong lúc đang thay đạn.
     "event"  = gọi thẳng event SHOOT_FIREWP trong event sheet.
                + Bắn được KỂ CẢ khi đang thay đạn.
                - Súng vừa mới nhặt lên có thể không ăn.
   Đây là giá trị MẶC ĐỊNH khi mới cài. Trong game bấm F8 để đổi qua lại - lựa chọn
   đó được lưu và sẽ ưu tiên hơn dòng dưới ở các lần chơi sau.
   Muốn quay về mặc định: gõ RESET_ATTACK_MODE() trong console (F9). */
var ATTACK_MODE = "canvas";
