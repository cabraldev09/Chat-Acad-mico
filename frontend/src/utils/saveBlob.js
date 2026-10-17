import api from "../services/api";
import toastError from "../errors/toastError";

// Hands a file to the browser's download (the name is what the person finds in the folder).
export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // some browsers read the address after the click returns
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// the name the server gave the file (Content-Disposition), or the fallback
const nameFrom = (response, fallback) => {
  const header = (response.headers && (response.headers["content-disposition"] || response.headers["Content-Disposition"])) || "";
  const m = String(header).match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]) : fallback;
};

// A refused download answers with JSON, but the browser asked for a blob: read the answer so the person sees the real reason.
const readableError = async (err) => {
  const blob = err && err.response && err.response.data;
  if (blob && typeof blob.text === "function") {
    try { err.response.data = JSON.parse(await blob.text()); } catch (e) { /* not JSON: the status text is used */ }
  }
  return err;
};

// Downloads a file from the API (a spreadsheet, for example). Returns true when it was saved.
export const downloadFile = async (path, params, fallbackName) => {
  try {
    const response = await api.get(path, { params, responseType: "blob" });
    saveBlob(response.data, nameFrom(response, fallbackName));
    return true;
  } catch (err) {
    toastError(await readableError(err));
    return false;
  }
};
