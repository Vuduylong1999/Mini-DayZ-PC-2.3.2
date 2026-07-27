/* ============================================================
   MiniDayZ PC - Mặc định điều khiển = Keyboard (WASD)

   Game chọn kiểu di chuyển bằng 3 NHÓM event (group):
       movement_tap | movement_stick | movement_wasd
   và biến toàn cục GUI_control_type (0=tap, 1=stick, 2=wasd) chỉ dùng cho
   HIỂN THỊ + lưu. Nút Settings khi bấm vừa đổi biến VỪA bật/tắt group.
   => Chỉ đặt biến thôi thì label đổi nhưng điều khiển KHÔNG đổi.
   Mod này làm đủ cả hai: đặt biến = 2 và bật group movement_wasd
   (tắt movement_stick / movement_tap), giống hệt thao tác bấm nút.

   LOCK_WASD = true  : luôn giữ WASD (poll mỗi giây, kể cả sau khi load save).
   LOCK_WASD = false : chỉ ép 1 lần khi vừa vào game; sau đó bạn tự đổi trong Settings được.
   ============================================================ */
(function () {
	var WASD_VALUE = 2;        // GUI_control_type cho "Keyboard (WASD)"
	var LOCK_WASD  = true;     // true = giữ cứng WASD; false = chỉ set 1 lần lúc vào game

	function getRT() {
		if (window.runtSCRIPT) return window.runtSCRIPT;
		if (typeof cr_getC2Runtime !== "undefined") {
			var rt = cr_getC2Runtime();
			if (rt) window.runtSCRIPT = rt;
			return rt;
		}
		return null;
	}

	var cachedVar = null;
	function findVar(rt, name) {
		if (cachedVar) return cachedVar;
		var sheets = rt.Hr; if (!sheets) return null;
		for (var sn in sheets) {
			var vg = sheets[sn] && sheets[sn].Vg;
			if (vg && vg.length) for (var i = 0; i < vg.length; i++)
				if (vg[i] && vg[i].name === name) { cachedVar = vg[i]; return cachedVar; }
		}
		return null;
	}

	// Bật/tắt 1 group theo tên (rt.wj giữ group theo tên thường, .Dm() bật/tắt + lan xuống con)
	function setGroup(rt, name, active) {
		var g = rt.wj && rt.wj[name];
		if (g && typeof g.Dm === "function") {
			if (g.ci !== active) g.Dm(active);
			return true;
		}
		return false;
	}

	function applyWASD() {
		var rt = getRT();
		if (!rt) return false;
		// chỉ áp dụng khi các group di chuyển đã tồn tại (đang trong layout chơi)
		if (!rt.wj || !rt.wj.movement_wasd) return false;

		var v = findVar(rt, "GUI_control_type");
		if (v && v.data !== WASD_VALUE) { v.data = WASD_VALUE; v.gs = WASD_VALUE; }

		setGroup(rt, "movement_wasd", true);
		setGroup(rt, "movement_stick", false);
		setGroup(rt, "movement_tap", false);
		return true;
	}

	if (LOCK_WASD) {
		setInterval(applyWASD, 1000);
	} else {
		// chỉ set 1 lần cho mỗi lần vào layout chơi: chờ tới khi áp dụng được thì dừng,
		// và reset cờ khi rời khỏi gameplay để lần vào sau lại set tiếp.
		var doneThisLayout = false;
		setInterval(function () {
			var rt = getRT();
			var inGameplay = rt && rt.wj && rt.wj.movement_wasd;
			if (inGameplay && !doneThisLayout) { if (applyWASD()) doneThisLayout = true; }
			else if (!inGameplay) { doneThisLayout = false; }
		}, 800);
	}

	console.log("[default_wasd] Đã nạp. Mặc định điều khiển = Keyboard (WASD). LOCK_WASD =", LOCK_WASD);
})();
