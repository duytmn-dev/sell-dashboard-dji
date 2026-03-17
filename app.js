    import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
    import {
      getFirestore,
      collection,
      doc,
      getDocs,
      setDoc,
      deleteDoc,
      writeBatch,
      query,
      orderBy
    } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

    const DEFAULT_CLOUDINARY_CONFIG = {
      cloudName: "diaxqp7tz",
      uploadPreset: "sell_unsigned",
      folder: "products"
    };
    const DEFAULT_FIREBASE_CONFIG = {
      apiKey: "AIzaSyC06TtSFX4JfRNKejXx8jOf7EgN0vI1auc",
      authDomain: "sell-d2b09.firebaseapp.com",
      projectId: "sell-d2b09",
      storageBucket: "sell-d2b09.firebasestorage.app",
      messagingSenderId: "937736215716",
      appId: "1:937736215716:web:940012458ffca74cfa5a31"
    };
    const FIREBASE_APP_NAME = "sales-stock-manager-firestore";
    const FIRESTORE_COLLECTION = "sales_products";

    const defaultRows = [
      { product: "DJI Osmo Action 6 Adventure combo", status: "da-ban", cost: 11704000, sell: 12000000 },
      { product: "DJI Osmo Action 6 Adventure combo", status: "da-ban", cost: 11357500, sell: 12000000 },
      { product: "Camera DJI Osmo Pocket 3 Creator Combo", status: "da-ban", cost: 10164513, sell: 11100000 },
      { product: "Camera Hành Động DJI Osmo Action 5 Pro", status: "da-ban", cost: 8352400, sell: 9000000 },
      { product: "Camera Hành Động DJI Osmo Action 5 Pro", status: "da-ban", cost: 8352400, sell: 9000000 },
      { product: "Camera Hành Động DJI Osmo Action 5 Pro", status: "da-ban", cost: 8382800, sell: 9000000 },
      { product: "Camera Hành Động DJI Osmo Action 5 Pro", status: "da-ban", cost: 8500000, sell: 9000000 }
    ];

    let rows = [];
    let detailRowIndex = null;
    let activePreviewImageUrl = "";
    let firestoreDb = null;
    let firestoreReady = false;
    const saveTimers = new Map();

    const tbody = document.getElementById("tbody");
    const summaryCards = document.getElementById("summaryCards");
    const saveStatus = document.getElementById("saveStatus");
    const stickySaveDesktop = document.getElementById("stickySaveDesktop");
    const stickyActionsMobile = document.getElementById("stickyActionsMobile");
    const firestoreAlert = document.getElementById("firestoreAlert");
    const saveToast = document.getElementById("saveToast");
    const productModal = document.getElementById("productModal");
    const modalProductName = document.getElementById("modalProductName");
    const detailSerial = document.getElementById("detailSerial");
    const detailNotes = document.getElementById("detailNotes");
    const detailImageFile = document.getElementById("detailImageFile");
    const uploadImageBtn = document.getElementById("uploadImageBtn");
    const uploadStatus = document.getElementById("uploadStatus");
    const previewFrame = document.getElementById("previewFrame");
    const imagePreview = document.getElementById("imagePreview");
    const imageGallery = document.getElementById("imageGallery");

    let cloudinaryConfig = null;
    let toastTimer = null;
    let previewPanX = 0;
    let previewPanY = 0;
    let previewMaxX = 0;
    let previewMaxY = 0;
    let previewDragging = false;
    let previewStartX = 0;
    let previewStartY = 0;
    let previewOriginX = 0;
    let previewOriginY = 0;

    function createRowId() {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }

      return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeRow(row) {
      return {
        id: row.id || createRowId(),
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        product: row.product || "",
        status: row.status || "ton",
        cost: parseMoney(row.cost),
        sell: parseMoney(row.sell),
        details: {
          serial: row.details?.serial || "",
          image: row.details?.image || "",
          images: Array.isArray(row.details?.images)
            ? row.details.images.map((image) => ({
                url: image?.url || "",
                path: image?.path || "",
                name: image?.name || "",
                publicId: image?.publicId || "",
                deleteToken: image?.deleteToken || ""
              })).filter((image) => image.url)
            : row.details?.image
              ? [{ url: row.details.image, path: "", name: "", publicId: "", deleteToken: "" }]
              : [],
          notes: row.details?.notes || ""
        }
      };
    }

    function setStatusText(element, message, mode = "") {
      element.textContent = message;
      element.classList.remove("error", "success");
      if (mode) element.classList.add(mode);
    }

    function setSaveStatus(message, mode = "") {
      saveStatus.textContent = message;
      saveStatus.classList.remove("error", "success");
      if (mode) saveStatus.classList.add(mode);
    }

    function showToast(message, mode = "success") {
      if (!saveToast) return;
      saveToast.textContent = message;
      saveToast.classList.remove("success", "error", "show");
      saveToast.classList.add(mode);

      if (toastTimer) {
        clearTimeout(toastTimer);
      }

      requestAnimationFrame(() => {
        saveToast.classList.add("show");
      });

      toastTimer = setTimeout(() => {
        saveToast.classList.remove("show");
      }, 2200);
    }

    function setFirestoreAlert(message = "", visible = false) {
      if (!visible) {
        firestoreAlert.classList.remove("show");
        return;
      }

      firestoreAlert.innerHTML = `<div><strong>Firestore chưa sẵn sàng.</strong><br />${escapeHtml(message)}</div>`;
      firestoreAlert.classList.add("show");
    }

    function getFirebaseConfig() {
      if (!DEFAULT_FIREBASE_CONFIG.projectId || !DEFAULT_FIREBASE_CONFIG.apiKey || !DEFAULT_FIREBASE_CONFIG.appId) {
        setFirestoreAlert("Thiếu firebaseConfig trong mã nguồn.", true);
        return null;
      }
      setFirestoreAlert("", false);
      return DEFAULT_FIREBASE_CONFIG;
    }

    function toFirestoreRow(row, index) {
      return {
        sort_order: index,
        product: row.product,
        status: row.status,
        cost: parseMoney(row.cost),
        sell: parseMoney(row.sell),
        details: row.details
      };
    }

    function clearSaveTimer(rowId) {
      if (!saveTimers.has(rowId)) return;
      clearTimeout(saveTimers.get(rowId));
      saveTimers.delete(rowId);
    }

    async function saveRowToFirestore(row, index, showDone = false) {
      if (!firestoreReady || !firestoreDb) return;
      clearSaveTimer(row.id);
      await setDoc(doc(firestoreDb, FIRESTORE_COLLECTION, row.id), toFirestoreRow(row, index), { merge: true });
      setFirestoreAlert("", false);

      if (showDone) {
        setSaveStatus("Đã lưu dữ liệu lên Firebase.", "success");
        showToast("Đã lưu dữ liệu lên Firebase.", "success");
      } else {
        setSaveStatus("Đã đồng bộ thay đổi lên Firebase.", "success");
      }
    }

    function scheduleSaveRow(index, delay = 700) {
      const row = rows[index];
      if (!row?.id || !firestoreReady) return;

      clearSaveTimer(row.id);
      const timer = setTimeout(() => {
        saveRowToFirestore(row, index).catch((error) => {
          setSaveStatus("Lưu Firebase thất bại: " + error.message, "error");
        });
      }, delay);
      saveTimers.set(row.id, timer);
    }

    async function deleteRowFromFirestore(rowId) {
      if (!firestoreReady || !firestoreDb || !rowId) return;
      clearSaveTimer(rowId);
      await deleteDoc(doc(firestoreDb, FIRESTORE_COLLECTION, rowId));
      setFirestoreAlert("", false);
    }

    async function saveAllRowsToFirestore(showDone = false) {
      if (!firestoreReady || !firestoreDb) return;
      rows = rows.map((row, index) => ({ ...row, sort_order: index }));
      const batch = writeBatch(firestoreDb);
      rows.forEach((row, index) => {
        batch.set(doc(firestoreDb, FIRESTORE_COLLECTION, row.id), toFirestoreRow(row, index), { merge: true });
      });
      await batch.commit();
      setFirestoreAlert("", false);
      setSaveStatus(showDone ? "Đã lưu toàn bộ dữ liệu lên Firebase." : "Đã đồng bộ toàn bộ dữ liệu.", "success");
      if (showDone) {
        showToast("Đã lưu toàn bộ dữ liệu lên Firebase.", "success");
      }
    }

    async function loadRowsFromFirestore() {
      if (!firestoreReady || !firestoreDb) {
        rows = structuredClone(defaultRows).map(normalizeRow).map((row, index) => ({ ...row, sort_order: index }));
        render();
        setSaveStatus("Thiếu cấu hình Firebase. Hãy điền firebaseConfig trong mã nguồn.", "error");
        setFirestoreAlert("Thiếu firebaseConfig trong mã nguồn.", true);
        return;
      }

      setSaveStatus("Đang tải dữ liệu từ Firebase...");
      try {
        const snapshot = await getDocs(query(collection(firestoreDb, FIRESTORE_COLLECTION), orderBy("sort_order", "asc")));
        const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (!data.length) {
          rows = structuredClone(defaultRows).map(normalizeRow).map((row, index) => ({ ...row, sort_order: index }));
          await saveAllRowsToFirestore(true).catch(() => {});
        } else {
          rows = data.map(normalizeRow).sort((a, b) => a.sort_order - b.sort_order);
        }
        render();
        setFirestoreAlert("", false);
        setSaveStatus("Đã tải dữ liệu từ Firebase.", "success");
      } catch (error) {
        rows = structuredClone(defaultRows).map(normalizeRow).map((row, index) => ({ ...row, sort_order: index }));
        render();
        setSaveStatus("Tải dữ liệu Firebase thất bại: " + error.message, "error");
        setFirestoreAlert("Không đọc được dữ liệu từ Firestore. Hãy kiểm tra đã tạo Firestore Database và publish rules cho collection `sales_products`.", true);
      }
    }

    function initFirestore() {
      const config = getFirebaseConfig();
      if (!config) {
        firestoreDb = null;
        firestoreReady = false;
        return;
      }
      const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
      const app = existingApp || initializeApp(config, FIREBASE_APP_NAME);
      firestoreDb = getFirestore(app);
      firestoreReady = true;
    }

    function updateImagePreview(url) {
      activePreviewImageUrl = url || "";
      if (!url) {
        imagePreview.removeAttribute("src");
        imagePreview.classList.remove("has-image");
        previewFrame.classList.add("no-drag");
        imagePreview.style.width = "";
        imagePreview.style.height = "";
        imagePreview.style.transform = "translate(-50%, -50%)";
        return;
      }

      imagePreview.src = url;
      imagePreview.classList.add("has-image");
      previewPanX = 0;
      previewPanY = 0;
    }

    function clampPreviewPan() {
      previewPanX = Math.max(-previewMaxX, Math.min(previewMaxX, previewPanX));
      previewPanY = Math.max(-previewMaxY, Math.min(previewMaxY, previewPanY));
    }

    function applyPreviewTransform() {
      imagePreview.style.transform = `translate(-50%, -50%) translate(${previewPanX}px, ${previewPanY}px)`;
    }

    function updatePreviewLayout() {
      if (!imagePreview.src || !imagePreview.naturalWidth || !imagePreview.naturalHeight) return;

      const frameWidth = previewFrame.clientWidth;
      const frameHeight = previewFrame.clientHeight;
      const scale = Math.max(frameWidth / imagePreview.naturalWidth, frameHeight / imagePreview.naturalHeight);
      const renderWidth = imagePreview.naturalWidth * scale;
      const renderHeight = imagePreview.naturalHeight * scale;

      imagePreview.style.width = `${renderWidth}px`;
      imagePreview.style.height = `${renderHeight}px`;

      previewMaxX = Math.max(0, (renderWidth - frameWidth) / 2);
      previewMaxY = Math.max(0, (renderHeight - frameHeight) / 2);
      previewFrame.classList.toggle("no-drag", previewMaxX === 0 && previewMaxY === 0);
      clampPreviewPan();
      applyPreviewTransform();
    }

    function renderImageGallery(images = []) {
      if (!images.length) {
        imageGallery.innerHTML = '<div class="gallery-empty">Chưa có ảnh nào cho sản phẩm này.</div>';
        return;
      }

      imageGallery.innerHTML = images.map((image, index) => `
        <div class="gallery-item ${image.url === activePreviewImageUrl ? "active" : ""}">
          <button class="gallery-thumb-btn" type="button" data-preview-image="${index}">
            <img src="${escapeHtml(image.url)}" alt="Ảnh sản phẩm ${index + 1}" />
          </button>
          <div class="gallery-name">${escapeHtml(image.name || `Ảnh ${index + 1}`)}</div>
          <button class="delete-btn" type="button" data-remove-image="${index}">Xóa ảnh</button>
        </div>
      `).join("");
    }

    function initCloudinary(config) {
      if (!config) {
        cloudinaryConfig = null;
        return false;
      }

      try {
        if (!config.cloudName || !config.uploadPreset) {
          throw new Error("Thiếu cloudName hoặc uploadPreset.");
        }
        cloudinaryConfig = {
          cloudName: String(config.cloudName).trim(),
          uploadPreset: String(config.uploadPreset).trim(),
          folder: String(config.folder || "products").trim()
        };
        return true;
      } catch (error) {
        cloudinaryConfig = null;
        setStatusText(uploadStatus, "Lỗi cấu hình Cloudinary: " + error.message, "error");
        return false;
      }
    }

    async function uploadImageToCloudinary(file) {
      if (!cloudinaryConfig) {
        throw new Error("Cloudinary chưa được cấu hình.");
      }

      if (!Number.isInteger(detailRowIndex) || !rows[detailRowIndex]) {
        throw new Error("Không xác định được sản phẩm cần upload.");
      }

      const safeProduct = (rows[detailRowIndex].product || "san-pham")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "san-pham";

      const folder = cloudinaryConfig.folder ? `${cloudinaryConfig.folder}/${safeProduct}` : safeProduct;
      const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/image/upload`;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", cloudinaryConfig.uploadPreset);
      formData.append("folder", folder);

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || "Upload Cloudinary thất bại.");
      }

      return {
        url: payload.secure_url || payload.url || "",
        path: payload.asset_id || "",
        name: file.name,
        publicId: payload.public_id || "",
        deleteToken: payload.delete_token || ""
      };
    }

    function parseMoney(value) {
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      if (!value) return 0;
      return Number(String(value).replace(/[^\d-]/g, "")) || 0;
    }

    function formatMoney(value) {
      return Number(value || 0).toLocaleString("vi-VN") + " đ";
    }

    function escapeHtml(text) {
      return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function getStatusLabel(status) {
      if (status === "da-ban") return "Đã bán";
      if (status === "dang-giao") return "Đang giao";
      if (status === "huy") return "Hủy";
      return "Tồn kho";
    }

    function getStatusClass(status) {
      if (status === "da-ban") return "status-da-ban";
      if (status === "dang-giao") return "status-dang-giao";
      if (status === "huy") return "status-huy";
      return "status-ton";
    }

    function hasDetails(details) {
      if (!details) return false;
      return [
        details.serial,
        details.image,
        details.notes
      ].some((value) => String(value || "").trim() !== "") || (details.images?.length || 0) > 0;
    }

    function calcProfit(row) {
      return parseMoney(row.sell) - parseMoney(row.cost);
    }

    function calcSummary() {
      let totalRevenueSold = 0;
      let totalProfitSold = 0;
      let totalStockCapital = 0;
      let totalImportSpend = 0;
      let soldCount = 0;

      rows.forEach((row) => {
        const cost = parseMoney(row.cost);
        const sell = parseMoney(row.sell);
        totalImportSpend += cost;

        if (row.status === "da-ban") {
          totalRevenueSold += sell;
          totalProfitSold += sell - cost;
          soldCount += 1;
          return;
        }

        if (row.status !== "huy") {
          totalStockCapital += cost;
        }
      });

      const remainingDeficitRaw = totalImportSpend - totalRevenueSold;
      const remainingDeficit = Math.max(remainingDeficitRaw, 0);

      return {
        totalRevenueSold,
        totalProfitSold,
        totalStockCapital,
        totalImportSpend,
        remainingDeficit,
        remainingDeficitRaw,
        soldCount
      };
    }

    function renderSummary() {
      const summary = calcSummary();
      const items = [
        {
          label: "Tổng vốn đã chi",
          value: formatMoney(summary.totalImportSpend),
          hint: "Toàn bộ tiền nhập sản phẩm."
        },
        {
          label: "Doanh thu đã bán",
          value: formatMoney(summary.totalRevenueSold),
          hint: summary.soldCount + " sản phẩm đã bán."
        },
        {
          label: "Tổng lãi đã chốt",
          value: formatMoney(summary.totalProfitSold),
          hint: "Chỉ tính cho trạng thái Đã bán.",
          className: summary.totalProfitSold >= 0 ? "good" : "bad"
        },
        {
          label: "Vốn hàng tồn",
          value: formatMoney(summary.totalStockCapital),
          hint: "Tiền còn nằm trong hàng chưa bán."
        },
        {
          label: "Âm còn lại",
          value: formatMoney(summary.remainingDeficit),
          hint: summary.remainingDeficitRaw > 0 ? "Vẫn đang âm vốn." : "Đã thu hồi vốn hoặc dư tiền.",
          className: summary.remainingDeficit > 0 ? "bad" : "good"
        }
      ];

      summaryCards.innerHTML = items.map((item) => `
        <article class="card">
          <div class="label">${item.label}</div>
          <div class="value ${item.className || ""}">${item.value}</div>
          <div class="hint">${item.hint}</div>
        </article>
      `).join("");
    }

    function renderTable() {
      if (!rows.length) {
        tbody.innerHTML = '<tr><td class="empty" colspan="7">Chưa có sản phẩm nào. Bấm "Thêm sản phẩm" để bắt đầu.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map((row, index) => {
        const profit = calcProfit(row);
        const profitClass = profit >= 0 ? "profit-positive" : "profit-negative";

        return `
          <tr>
            <td>${index + 1}</td>
            <td>
              <div class="product-cell">
                <input
                  type="text"
                  data-index="${index}"
                  data-key="product"
                  value="${escapeHtml(row.product)}"
                  placeholder="Tên sản phẩm"
                />
                <button
                  class="info-btn ${hasDetails(row.details) ? "has-data" : ""}"
                  type="button"
                  data-info="${index}"
                  title="Thông tin sản phẩm"
                >i</button>
              </div>
            </td>
            <td>
              <select class="status-select ${getStatusClass(row.status)}" data-index="${index}" data-key="status">
                <option value="ton" ${row.status === "ton" ? "selected" : ""}>Tồn kho</option>
                <option value="dang-giao" ${row.status === "dang-giao" ? "selected" : ""}>Đang giao</option>
                <option value="da-ban" ${row.status === "da-ban" ? "selected" : ""}>Đã bán</option>
                <option value="huy" ${row.status === "huy" ? "selected" : ""}>Hủy</option>
              </select>
            </td>
            <td>
              <input
                type="text"
                inputmode="numeric"
                data-index="${index}"
                data-key="cost"
                data-money="1"
                value="${parseMoney(row.cost) ? Number(row.cost).toLocaleString("vi-VN") : ""}"
                placeholder="0"
              />
            </td>
            <td>
              <input
                type="text"
                inputmode="numeric"
                data-index="${index}"
                data-key="sell"
                data-money="1"
                value="${parseMoney(row.sell) ? Number(row.sell).toLocaleString("vi-VN") : ""}"
                placeholder="0"
              />
            </td>
            <td class="money-cell profit-cell ${profitClass}">${formatMoney(profit)}</td>
            <td>
              <button class="delete-btn" type="button" data-delete="${index}">Xóa</button>
            </td>
          </tr>
        `;
      }).join("");
    }

    function updateComputedRow(rowElement, rowData) {
      if (!rowElement) return;
      const profitCell = rowElement.querySelector(".profit-cell");
      if (!profitCell) return;

      const profit = calcProfit(rowData);
      profitCell.textContent = formatMoney(profit);
      profitCell.classList.toggle("profit-positive", profit >= 0);
      profitCell.classList.toggle("profit-negative", profit < 0);
    }

    function render() {
      renderTable();
      renderSummary();
    }

    function openDetailModal(index) {
      const row = rows[index];
      if (!row) return;

      detailRowIndex = index;
      modalProductName.textContent = row.product || "Sản phẩm chưa đặt tên";
      detailSerial.value = row.details?.serial || "";
      detailNotes.value = row.details?.notes || "";
      detailImageFile.value = "";
      updateImagePreview(row.details?.image || "");
      renderImageGallery(row.details?.images || []);
      setStatusText(uploadStatus, row.details?.image ? "Đã có ảnh cho sản phẩm này." : "Chưa chọn ảnh.");
      productModal.classList.add("open");
      productModal.setAttribute("aria-hidden", "false");
      detailSerial.focus();
    }

    function closeDetailModal() {
      detailRowIndex = null;
      productModal.classList.remove("open");
      productModal.setAttribute("aria-hidden", "true");
    }

    document.getElementById("addRowBtn").addEventListener("click", () => {
      const nextRow = normalizeRow({
        product: "",
        status: "ton",
        cost: 0,
        sell: 0,
        details: {
          serial: "",
          image: "",
          images: [],
          notes: ""
        }
      });
      nextRow.sort_order = rows.length;
      rows.push(nextRow);
      render();
      saveRowToFirestore(nextRow, rows.length - 1, true).catch((error) => {
        setSaveStatus("Lưu Firebase thất bại: " + error.message, "error");
      });
    });

    function triggerSaveAll() {
      saveAllRowsToFirestore(true).catch((error) => {
        setSaveStatus("Lưu Firebase thất bại: " + error.message, "error");
        showToast("Lưu dữ liệu thất bại.", "error");
      });
    }

    document.getElementById("saveBtnInline").addEventListener("click", triggerSaveAll);
    stickySaveDesktop.addEventListener("click", triggerSaveAll);

    stickyActionsMobile.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const action = button.dataset.action || "";
      if (action === "save") {
        triggerSaveAll();
        return;
      }

      if (action === "add-product") {
        document.getElementById("addRowBtn").click();
      }
    });

    tbody.addEventListener("input", (event) => {
      const target = event.target;
      const index = Number(target.dataset.index);
      const key = target.dataset.key;

      if (!Number.isInteger(index) || !key) return;

      if (target.dataset.money === "1") {
        rows[index][key] = parseMoney(target.value);
      } else {
        rows[index][key] = target.value;
      }

      updateComputedRow(target.closest("tr"), rows[index]);
      renderSummary();
      scheduleSaveRow(index);
    });

    tbody.addEventListener("change", (event) => {
      const target = event.target;
      const index = Number(target.dataset.index);
      const key = target.dataset.key;

      if (!Number.isInteger(index) || !key) return;

      rows[index][key] = target.value;
      render();
      scheduleSaveRow(index, 150);
    });

    tbody.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.dataset.money !== "1") return;
      const value = parseMoney(target.value);
      target.value = value ? String(value) : "";
    });

    tbody.addEventListener("focusout", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.dataset.money !== "1") return;
      const value = parseMoney(target.value);
      target.value = value ? value.toLocaleString("vi-VN") : "";
    });

    tbody.addEventListener("click", (event) => {
      const infoButton = event.target.closest("[data-info]");
      if (infoButton) {
        const index = Number(infoButton.dataset.info);
        if (Number.isInteger(index)) {
          openDetailModal(index);
        }
        return;
      }

      const button = event.target.closest("[data-delete]");
      if (!button) return;

      const index = Number(button.dataset.delete);
      if (!Number.isInteger(index)) return;
      const rowId = rows[index]?.id;

      rows.splice(index, 1);
      render();
      deleteRowFromFirestore(rowId).then(() => {
        saveAllRowsToFirestore().catch((error) => {
          setSaveStatus("Đồng bộ Firebase thất bại: " + error.message, "error");
        });
      }).catch((error) => {
        setSaveStatus("Xóa Firebase thất bại: " + error.message, "error");
      });
    });

    document.getElementById("closeModalBtn").addEventListener("click", closeDetailModal);
    document.getElementById("cancelModalBtn").addEventListener("click", closeDetailModal);

    document.getElementById("saveDetailBtn").addEventListener("click", () => {
      if (!Number.isInteger(detailRowIndex) || !rows[detailRowIndex]) return;

      rows[detailRowIndex].details = {
        serial: detailSerial.value.trim(),
        image: rows[detailRowIndex].details?.image || "",
        images: rows[detailRowIndex].details?.images || [],
        notes: detailNotes.value.trim()
      };

      render();
      saveRowToFirestore(rows[detailRowIndex], detailRowIndex, true).catch((error) => {
        setSaveStatus("Lưu Firebase thất bại: " + error.message, "error");
        showToast("Lưu thông tin thất bại.", "error");
      });
      closeDetailModal();
    });

    uploadImageBtn.addEventListener("click", async () => {
      const files = Array.from(detailImageFile.files || []);
      if (!files.length) {
        setStatusText(uploadStatus, "Chọn ảnh trước khi upload.", "error");
        return;
      }

      try {
        setStatusText(uploadStatus, `Đang upload ${files.length} ảnh...`);
        const uploadedImages = [];

        for (const file of files) {
          const uploaded = await uploadImageToCloudinary(file);
          uploadedImages.push(uploaded);
        }

        const currentImages = rows[detailRowIndex].details?.images || [];
        rows[detailRowIndex].details.images = [...currentImages, ...uploadedImages];
        rows[detailRowIndex].details.image = rows[detailRowIndex].details.images[0]?.url || "";
        updateImagePreview(rows[detailRowIndex].details.image);
        renderImageGallery(rows[detailRowIndex].details.images);
        saveRowToFirestore(rows[detailRowIndex], detailRowIndex, true).catch((error) => {
          setSaveStatus("Lưu Firebase thất bại: " + error.message, "error");
        });
        detailImageFile.value = "";
        setStatusText(uploadStatus, `Upload thành công ${uploadedImages.length} ảnh lên Cloudinary.`, "success");
      } catch (error) {
        setStatusText(uploadStatus, error.message || "Upload ảnh thất bại.", "error");
      }
    });

    imageGallery.addEventListener("click", async (event) => {
      const previewButton = event.target.closest("[data-preview-image]");
      if (previewButton) {
        if (!Number.isInteger(detailRowIndex) || !rows[detailRowIndex]) return;
        const imageIndex = Number(previewButton.dataset.previewImage);
        const images = rows[detailRowIndex].details?.images || [];
        const image = images[imageIndex];
        if (!Number.isInteger(imageIndex) || !image) return;

        updateImagePreview(image.url);
        renderImageGallery(images);
        return;
      }

      const button = event.target.closest("[data-remove-image]");
      if (!button) return;

      if (!Number.isInteger(detailRowIndex) || !rows[detailRowIndex]) return;

      const imageIndex = Number(button.dataset.removeImage);
      const images = rows[detailRowIndex].details?.images || [];
      const image = images[imageIndex];
      if (!Number.isInteger(imageIndex) || !image) return;

      try {
        setStatusText(uploadStatus, "Đang gỡ ảnh...");
        images.splice(imageIndex, 1);
        rows[detailRowIndex].details.images = images;
        rows[detailRowIndex].details.image = images[0]?.url || "";
        updateImagePreview(rows[detailRowIndex].details.image);
        renderImageGallery(images);
        saveRowToFirestore(rows[detailRowIndex], detailRowIndex, true).catch((error) => {
          setSaveStatus("Lưu Firebase thất bại: " + error.message, "error");
        });
        setStatusText(uploadStatus, "Đã gỡ ảnh khỏi giao diện và Firebase.", "success");
      } catch (error) {
        setStatusText(uploadStatus, error.message || "Xóa ảnh thất bại.", "error");
      }
    });

    productModal.addEventListener("click", (event) => {
      if (event.target === productModal) {
        closeDetailModal();
      }
    });

    imagePreview.addEventListener("load", updatePreviewLayout);

    previewFrame.addEventListener("pointerdown", (event) => {
      if (previewMaxX === 0 && previewMaxY === 0) return;
      previewDragging = true;
      previewStartX = event.clientX;
      previewStartY = event.clientY;
      previewOriginX = previewPanX;
      previewOriginY = previewPanY;
      previewFrame.classList.add("is-dragging");
      previewFrame.setPointerCapture(event.pointerId);
    });

    previewFrame.addEventListener("pointermove", (event) => {
      if (!previewDragging) return;
      previewPanX = previewOriginX + (event.clientX - previewStartX);
      previewPanY = previewOriginY + (event.clientY - previewStartY);
      clampPreviewPan();
      applyPreviewTransform();
    });

    function stopPreviewDrag(event) {
      if (!previewDragging) return;
      previewDragging = false;
      previewFrame.classList.remove("is-dragging");
      if (event && previewFrame.hasPointerCapture?.(event.pointerId)) {
        previewFrame.releasePointerCapture(event.pointerId);
      }
    }

    previewFrame.addEventListener("pointerup", stopPreviewDrag);
    previewFrame.addEventListener("pointercancel", stopPreviewDrag);
    previewFrame.addEventListener("pointerleave", stopPreviewDrag);

    window.addEventListener("resize", () => {
      if (imagePreview.classList.contains("has-image")) {
        updatePreviewLayout();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && productModal.classList.contains("open")) {
        closeDetailModal();
      }
    });

    initCloudinary(DEFAULT_CLOUDINARY_CONFIG);
    initFirestore();
    loadRowsFromFirestore().catch((error) => {
      rows = structuredClone(defaultRows).map(normalizeRow).map((row, index) => ({ ...row, sort_order: index }));
      render();
      setSaveStatus("Khởi tạo Firebase thất bại: " + error.message, "error");
    });
  
