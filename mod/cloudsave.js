/* ============================================================
   MiniDayZ PC 2.3.2 - Cloud Save qua Git
   Nạp SAU c2runtime.js. Cần Node + NW API (đã bật sẵn trong app này).

   Cơ chế:
     - MỞ game  -> git fetch -> đồng bộ thư mục cloudsave về đúng bản trên remote
                   -> nếu save trên git mới hơn save của máy này thì nạp vào
                      IndexedDB/localStorage rồi reload 1 lần.
     - TẮT game -> xuất toàn bộ save ra cloudsave/save-2.3.2.json -> commit + push.
                   Nếu push bị từ chối (máy kia đẩy trước) -> tự fetch, ghi đè lại
                   bản của mình lên trên (last-writer-wins) rồi push lại.

   Khác bản 2.1.4:
     - Không dùng "git pull --ff-only" nữa (hay chết cứng khi repo lệch nhánh).
     - Lần đầu chạy 2.3.2 mà chưa có save-2.3.2.json thì tự lấy save-2.3.1.json
       làm gốc (SEED_FROM) để không mất tiến trình cũ.
     - Nếu lần trước push hỏng (mất mạng), lần mở sau sẽ tự đẩy nốt rồi mới kéo về.
   ============================================================ */
(function () {
	"use strict";

	// ===================== CẤU HÌNH =====================
	// Thư mục repo git chứa save (mặc định: <thư mục game>/cloudsave).
	// Phải là 1 git repo đã có remote, đăng nhập sẵn trên cả 2 máy.
	var REPO_DIRNAME = "cloudsave";
	var SAVE_FILE    = "save-2.3.2.json";
	// Lần đầu chưa có SAVE_FILE thì lấy tạm các file này làm gốc (theo thứ tự ưu tiên).
	// Để mảng rỗng [] nếu muốn 2.3.2 bắt đầu từ save trắng.
	var SEED_FROM    = ["save-2.3.1.json", "save-2.1.4.json"];
	var GIT_TIMEOUT  = 60000; // ms cho mỗi lệnh git
	var PUSH_RETRY   = 2;     // số lần thử lại khi push bị từ chối
	// Tự lưu + đẩy nền mỗi N phút (phòng game/máy crash không kịp chạy hook lúc tắt).
	// 0 = tắt. Chạy nền bất đồng bộ nên không làm khựng game.
	var AUTOSAVE_MINUTES = 0;
	// ====================================================

	if (typeof require === "undefined") {
		console.warn("[cloudsave] Node không khả dụng -> bỏ qua cloud save.");
		return;
	}

	var fs   = require("fs");
	var path = require("path");
	var cp   = require("child_process");

	var APP_DIR   = process.cwd();
	var REPO_DIR  = path.join(APP_DIR, REPO_DIRNAME);
	var SAVE_PATH = path.join(REPO_DIR, SAVE_FILE);

	var LOCAL_TS_KEY = "cloudsave_local_ts";   // localStorage: ts của save đang có ở máy này
	var SYNCED_FLAG  = "cloudsave_synced";     // sessionStorage: đã sync trong phiên này chưa

	function log()  { console.log.apply(console, ["[cloudsave]"].concat([].slice.call(arguments))); }
	function warn() { console.warn.apply(console, ["[cloudsave]"].concat([].slice.call(arguments))); }

	// Env cấm git BẬT hỏi mật khẩu (nếu không sẽ TREO chờ nhập -> game đứng).
	var GIT_ENV = Object.assign({}, process.env, {
		GIT_TERMINAL_PROMPT: "0",      // không hỏi user/pass ở terminal
		GCM_INTERACTIVE: "never",      // Git Credential Manager không bật popup
		GIT_ASKPASS: "echo"            // fallback: trả rỗng thay vì chờ
	});
	var GIT_OPTS = {
		cwd: REPO_DIR, encoding: "utf8", timeout: GIT_TIMEOUT,
		env: GIT_ENV, maxBuffer: 64 * 1024 * 1024
	};

	// Đồng bộ (dùng lúc TẮT game - cửa sổ đang đóng nên khựng cũng không sao).
	function git(args) {
		return cp.execSync("git " + args, Object.assign({ stdio: ["ignore", "pipe", "pipe"] }, GIT_OPTS));
	}
	function gitSafe(args) {
		try { return { ok: true, out: git(args) }; }
		catch (e) { warn("git " + args + " lỗi:", (e.message || e)); return { ok: false, out: null }; }
	}
	// Bất đồng bộ (dùng lúc MỞ game - KHÔNG khóa luồng chính, UI không đứng).
	function gitAsync(args) {
		return new Promise(function (resolve) {
			cp.exec("git " + args, GIT_OPTS, function (err, stdout) {
				if (err) warn("git " + args + " lỗi:", (err.message || err));
				resolve({ ok: !err, out: stdout });
			});
		});
	}
	function trim(s) { return (s || "").toString().trim(); }

	/* ---------- mã hoá giá trị (kể cả Blob/ArrayBuffer) sang JSON ---------- */
	function abToB64(buf) {
		var bytes = new Uint8Array(buf), bin = "", CH = 0x8000;
		for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
		return btoa(bin);
	}
	function b64ToAb(b64) {
		var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
		for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
		return bytes.buffer;
	}
	function blobToB64(blob) {
		return new Promise(function (res, rej) {
			var r = new FileReader();
			r.onload = function () { var s = r.result; res(s.slice(s.indexOf(",") + 1)); };
			r.onerror = function () { rej(r.error); };
			r.readAsDataURL(blob);
		});
	}
	async function encodeVal(v) {
		if (v instanceof Blob)              return { __t: "blob", mime: v.type, b64: await blobToB64(v) };
		if (v instanceof ArrayBuffer)       return { __t: "ab", b64: abToB64(v) };
		if (ArrayBuffer.isView(v))          return { __t: "ta", ctor: v.constructor.name, b64: abToB64(v.buffer) };
		return v; // JSON-safe sẵn (string/number/object/array)
	}
	function decodeVal(v) {
		if (v && typeof v === "object" && v.__t) {
			if (v.__t === "blob") return new Blob([b64ToAb(v.b64)], { type: v.mime || "" });
			if (v.__t === "ab")   return b64ToAb(v.b64);
			if (v.__t === "ta")   { var C = window[v.ctor] || Uint8Array; return new C(b64ToAb(v.b64)); }
		}
		return v;
	}

	/* ---------- xuất / nhập IndexedDB ---------- */
	function dumpDB(name) {
		return new Promise(function (resolve, reject) {
			var req = indexedDB.open(name);
			req.onerror = function () { reject(req.error); };
			req.onsuccess = async function () {
				var db = req.result;
				var out = { version: db.version, stores: {} };
				var names = [].slice.call(db.objectStoreNames);
				if (!names.length) { db.close(); return resolve(out); }
				try {
					for (var n = 0; n < names.length; n++) {
						var sn = names[n];
						var meta = await new Promise(function (res, rej) {
							var tx = db.transaction(sn, "readonly");
							var st = tx.objectStore(sn);
							var m = { keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: [], rows: [] };
							for (var ix = 0; ix < st.indexNames.length; ix++) {
								var idx = st.index(st.indexNames[ix]);
								m.indexes.push({ name: idx.name, keyPath: idx.keyPath, unique: idx.unique, multiEntry: idx.multiEntry });
							}
							var gk = st.getAllKeys(), gv = st.getAll(), K, V, dk = false, dv = false;
							gk.onsuccess = function () { K = gk.result; dk = true; fin(); };
							gv.onsuccess = function () { V = gv.result; dv = true; fin(); };
							gk.onerror = gv.onerror = function () { rej(this.error); };
							async function fin() {
								if (!(dk && dv)) return;
								for (var i = 0; i < V.length; i++) m.rows.push({ key: K[i], value: await encodeVal(V[i]) });
								res(m);
							}
						});
						out.stores[sn] = meta;
					}
					db.close(); resolve(out);
				} catch (e) { db.close(); reject(e); }
			};
		});
	}

	function restoreDB(name, info) {
		return new Promise(function (resolve, reject) {
			var req = indexedDB.open(name, info.version || undefined);
			req.onupgradeneeded = function () {
				var db = req.result;
				Object.keys(info.stores).forEach(function (sn) {
					if (db.objectStoreNames.contains(sn)) return;
					var sm = info.stores[sn];
					var st = db.createObjectStore(sn, { keyPath: sm.keyPath || null, autoIncrement: !!sm.autoIncrement });
					(sm.indexes || []).forEach(function (i) { try { st.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry }); } catch (e) {} });
				});
			};
			req.onerror = function () { reject(req.error); };
			req.onsuccess = function () {
				var db = req.result;
				var names = Object.keys(info.stores).filter(function (s) { return db.objectStoreNames.contains(s); });
				if (!names.length) { db.close(); return resolve(); }
				var tx = db.transaction(names, "readwrite");
				tx.oncomplete = function () { db.close(); resolve(); };
				tx.onerror = function () { db.close(); reject(tx.error); };
				names.forEach(function (sn) {
					var st = tx.objectStore(sn), sm = info.stores[sn];
					st.clear();
					sm.rows.forEach(function (row) {
						var val = decodeVal(row.value);
						if (st.keyPath != null) st.put(val);        // in-line key
						else                    st.put(val, row.key); // out-of-line key
					});
				});
			};
		});
	}

	/* ---------- export / import toàn bộ ---------- */
	async function exportSave() {
		var data = { v: 1, ts: Date.now(), localStorage: {}, idb: {} };
		for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); data.localStorage[k] = localStorage.getItem(k); }
		var dbs = [];
		try { dbs = await indexedDB.databases(); } catch (e) { warn("không liệt kê được IndexedDB:", e.message); }
		for (var d = 0; d < dbs.length; d++) {
			if (!dbs[d].name) continue;
			try { data.idb[dbs[d].name] = await dumpDB(dbs[d].name); } catch (e) { warn("dump DB '" + dbs[d].name + "' lỗi:", e.message); }
		}
		return data;
	}
	async function importSave(data) {
		if (data.localStorage) Object.keys(data.localStorage).forEach(function (k) {
			if (k === LOCAL_TS_KEY) return; // ts quản lý riêng
			localStorage.setItem(k, data.localStorage[k]);
		});
		if (data.idb) { var names = Object.keys(data.idb); for (var i = 0; i < names.length; i++) {
			try { await restoreDB(names[i], data.idb[names[i]]); } catch (e) { warn("restore DB '" + names[i] + "' lỗi:", e.message); }
		} }
	}

	function readSaveFile(file) {
		var p = path.join(REPO_DIR, file);
		if (!fs.existsSync(p)) return null;
		try {
			var d = JSON.parse(fs.readFileSync(p, "utf8"));
			if (d && typeof d.ts === "number") return d;
			warn("file '" + file + "' không có ts hợp lệ -> bỏ qua.");
		} catch (e) { warn("đọc '" + file + "' lỗi:", e.message); }
		return null;
	}

	/* ---------- ĐỒNG BỘ REPO VỀ BẢN MỚI NHẤT TRÊN REMOTE ---------- */
	// Trả về tên nhánh hiện tại, hoặc null nếu repo hỏng.
	async function syncRepoFromRemote() {
		var br = trim((await gitAsync("rev-parse --abbrev-ref HEAD")).out);
		if (!br || br === "HEAD") { warn("không xác định được nhánh -> bỏ qua đồng bộ."); return null; }

		if (!(await gitAsync("fetch origin --prune")).ok) {
			warn("fetch thất bại (mất mạng?) -> dùng bản đang có ở máy.");
			return br;
		}

		// Còn commit chưa đẩy lên (lần trước push hỏng)? Đẩy nốt trước khi kéo về.
		var ahead = Number(trim((await gitAsync("rev-list --count origin/" + br + "..HEAD")).out) || 0);
		if (ahead > 0) {
			log("Có " + ahead + " commit save chưa đẩy lên -> đang đẩy nốt...");
			if (!(await gitAsync("push origin HEAD:" + br)).ok) {
				warn("vẫn đẩy chưa được -> GIỮ NGUYÊN save máy này, không kéo đè.");
				return br; // tuyệt đối không reset --hard: sẽ mất save chưa đẩy
			}
			log("Đã đẩy nốt save cũ lên git.");
		}

		// Lúc này local không còn gì để mất -> ép khớp remote.
		await gitAsync("reset --hard origin/" + br);
		await gitAsync("clean -fd");
		return br;
	}

	/* ---------- LÚC MỞ GAME: pull + import ---------- */
	async function onOpen() {
		if (sessionStorage.getItem(SYNCED_FLAG)) { attachCloseHook(); startAutosave(); return; }

		if (!fs.existsSync(path.join(REPO_DIR, ".git"))) {
			warn("Không thấy git repo ở:", REPO_DIR, "- bỏ qua cloud save.");
			sessionStorage.setItem(SYNCED_FLAG, "1"); attachCloseHook(); return;
		}

		await syncRepoFromRemote();

		var remote = readSaveFile(SAVE_FILE);
		var seeded = null;
		if (!remote) {
			for (var i = 0; i < SEED_FROM.length && !remote; i++) {
				remote = readSaveFile(SEED_FROM[i]);
				if (remote) seeded = SEED_FROM[i];
			}
		}

		if (remote) {
			var localTs = Number(localStorage.getItem(LOCAL_TS_KEY) || 0);
			if (remote.ts > localTs) {
				log((seeded ? "Chưa có " + SAVE_FILE + " -> lấy '" + seeded + "' làm gốc" : "Save trên git mới hơn") +
					" (" + new Date(remote.ts).toLocaleString() + ") -> đang nạp...");
				try {
					await importSave(remote);
					localStorage.setItem(LOCAL_TS_KEY, String(remote.ts));
					sessionStorage.setItem(SYNCED_FLAG, "1");
					log("Đã nạp save từ git. Tải lại game...");
					location.reload();
					return;
				} catch (e) {
					warn("nạp save lỗi (chơi tiếp bằng save máy này):", e.message);
				}
			} else {
				log("Save máy này đã mới nhất (" + new Date(localTs).toLocaleString() + "), không cần nạp.");
			}
		} else {
			log("Chưa có save nào trên git - sẽ tạo " + SAVE_FILE + " khi tắt game.");
		}
		sessionStorage.setItem(SYNCED_FLAG, "1");
		attachCloseHook();
		startAutosave();
	}

	/* ---------- ĐẨY LÊN GIT (dùng chung cho lúc tắt game và autosave) ---------- */
	// Ghi file + commit + push. Nếu remote đã đi trước -> kéo về rồi ghi đè bản của
	// mình lên trên (last-writer-wins) và push lại, tối đa PUSH_RETRY lần.
	function commitAndPush(data) {
		var json = JSON.stringify(data);
		var br = trim(gitSafe("rev-parse --abbrev-ref HEAD").out) || "main";

		for (var attempt = 0; attempt <= PUSH_RETRY; attempt++) {
			fs.writeFileSync(SAVE_PATH, json);
			gitSafe("add -A");
			// Không có gì thay đổi thì commit trả về lỗi -> bỏ qua, vẫn thử push.
			gitSafe('commit -m "save 2.3.2 ' + new Date(data.ts).toISOString() + '"');

			if (gitSafe("push origin HEAD:" + br).ok) {
				localStorage.setItem(LOCAL_TS_KEY, String(data.ts));
				return true;
			}
			if (attempt === PUSH_RETRY) break;

			// Bị từ chối: nhiều khả năng máy kia đã push trước. Kéo về rồi ghi đè lại.
			warn("push bị từ chối -> đồng bộ lại với remote rồi thử lần " + (attempt + 2) + "...");
			if (!gitSafe("fetch origin").ok) break; // mất mạng: thôi, để lần mở sau đẩy nốt
			gitSafe("reset --hard origin/" + br);
			gitSafe("clean -fd");
		}

		// Không push được: commit vẫn nằm ở local, lần mở game sau sẽ tự đẩy nốt.
		localStorage.setItem(LOCAL_TS_KEY, String(data.ts));
		warn("Chưa đẩy được lên git (mất mạng?). Save đã lưu ở local, lần mở sau sẽ tự đẩy.");
		return false;
	}

	/* ---------- LÚC TẮT GAME: export + push ---------- */
	var closing = false;
	function attachCloseHook() {
		if (typeof nw === "undefined") { warn("không có NW API -> không tự push lúc tắt."); return; }
		var win;
		try { win = nw.Window.get(); } catch (e) { warn("không lấy được cửa sổ NW:", e.message); return; }
		win.removeAllListeners("close");
		win.on("close", function () {
			var self = this;
			if (closing) return;
			closing = true;
			log("Đang lưu & đẩy save lên git trước khi thoát...");
			exportSave().then(function (data) {
				if (!fs.existsSync(REPO_DIR)) fs.mkdirSync(REPO_DIR, { recursive: true });
				if (commitAndPush(data)) log("Xong. Đã đẩy save lên git.");
			}).catch(function (e) {
				warn("export lỗi (vẫn thoát game):", e.message);
			}).then(function () { self.close(true); });
		});
	}

	/* ---------- AUTOSAVE nền (tuỳ chọn) ---------- */
	function startAutosave() {
		if (!AUTOSAVE_MINUTES || AUTOSAVE_MINUTES <= 0) return;
		setInterval(function () {
			if (closing) return;
			exportSave().then(function (data) {
				commitAndPush(data);
				log("Autosave đã đẩy lên git lúc", new Date(data.ts).toLocaleTimeString());
			}).catch(function (e) { warn("autosave lỗi:", e.message); });
		}, AUTOSAVE_MINUTES * 60000);
		log("Autosave nền: mỗi " + AUTOSAVE_MINUTES + " phút.");
	}

	// chạy sớm nhưng sau khi DOM sẵn sàng
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onOpen);
	else onOpen();

	/* ---------- lệnh gọi tay trong DevTools (F9) ---------- */
	window.cloudSaveExportNow = function () { return exportSave(); };
	window.cloudSaveImportNow = function (data) { return importSave(data); };
	window.cloudSavePushNow   = function () {
		return exportSave().then(function (d) { var ok = commitAndPush(d); log(ok ? "Đã đẩy." : "Đẩy hỏng."); return ok; });
	};
	window.cloudSavePullNow   = async function () {
		await syncRepoFromRemote();
		var d = readSaveFile(SAVE_FILE);
		if (!d) { warn("không có " + SAVE_FILE); return false; }
		await importSave(d);
		localStorage.setItem(LOCAL_TS_KEY, String(d.ts));
		log("Đã nạp save từ git (" + new Date(d.ts).toLocaleString() + "). Tải lại game...");
		location.reload();
		return true;
	};
	window.cloudSaveInfo = function () {
		return {
			REPO_DIR: REPO_DIR, SAVE_PATH: SAVE_PATH,
			localTs: localStorage.getItem(LOCAL_TS_KEY),
			localTsText: new Date(Number(localStorage.getItem(LOCAL_TS_KEY) || 0)).toLocaleString()
		};
	};

	log("Đã nạp. repo:", REPO_DIR, "| file:", SAVE_FILE);
})();
