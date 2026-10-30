import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/doubl/Documents/Oremus/outputs/trello-progress-20261023";
const outputPath = `${outputDir}/Bao_cao_tien_do_nhom_Oremus.xlsx`;
const previewSummary = `${outputDir}/preview-bao-cao.png`;
const previewDetails = `${outputDir}/preview-chi-tiet.png`;
const boardUrl = "https://trello.com/b/lftYuQu2/web-design";

const tasks = [
  [1, "To do 1", "Khởi tạo dự án & kiến trúc", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 10, 9, 0)), "Hoàn thành", "https://trello.com/c/8AkcBiSG"],
  [2, "To do 1", "Cơ sở dữ liệu MongoDB & migration", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 10, 11, 30)), "Hoàn thành", "https://trello.com/c/jus8KOf4"],
  [3, "To do 1", "Đăng ký, đăng nhập & bảo mật", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 10, 15, 0)), "Hoàn thành", "https://trello.com/c/Ra7tx7Gv"],
  [4, "To do 1", "Giao diện chung & dark mode", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 10, 17, 30)), "Hoàn thành", "https://trello.com/c/ceToAcB0"],
  [5, "To do 2", "Đăng bài & media (ảnh/video)", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 11, 8, 30)), "Hoàn thành", "https://trello.com/c/AuGpUYhv"],
  [6, "To do 2", "Newsfeed & cache Redis", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 11, 10, 30)), "Hoàn thành", "https://trello.com/c/G0gYeqyG"],
  [7, "To do 2", "Reaction, bình luận, chia sẻ & trình xem ảnh", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 11, 14, 0)), "Hoàn thành", "https://trello.com/c/bvidyxHt"],
  [8, "To do 2", "Trang cá nhân (Profile)", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 11, 16, 30)), "Hoàn thành", "https://trello.com/c/I5wDHXnC"],
  [9, "To do 2", "Bạn bè, follow & chặn", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 11, 20, 0)), "Hoàn thành", "https://trello.com/c/CRhwJhbG"],
  [10, "To do 3", "Nhóm (Groups)", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 12, 8, 30)), "Hoàn thành", "https://trello.com/c/2gdDs2lF"],
  [11, "To do 3", "Nhắn tin realtime (Socket.IO)", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 12, 10, 30)), "Hoàn thành", "https://trello.com/c/ev6Q2Hpg"],
  [12, "To do 3", "Thông báo realtime", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 12, 13, 30)), "Hoàn thành", "https://trello.com/c/dbNWQO5j"],
  [13, "To do 3", "Story 24 giờ", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 12, 16, 0)), "Hoàn thành", "https://trello.com/c/Xj6BQHyN"],
  [14, "To do 3", "Tìm kiếm & check-in địa điểm", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 12, 19, 30)), "Hoàn thành", "https://trello.com/c/YTA5Q3Qd"],
  [15, "To do 4", "Service Worker: chạy khi offline", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 13, 8, 0)), "Hoàn thành", "https://trello.com/c/ieuWE2rT"],
  [16, "To do 4", "Web Worker: xử lý ảnh đa luồng", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 13, 8, 30)), "Hoàn thành", "https://trello.com/c/D1upPXvg"],
  [17, "To do 4", "Infinite scroll cho mọi danh sách dài", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 13, 13, 0)), "Hoàn thành", "https://trello.com/c/HGUqEXGk"],
  [18, "To do 4", "Dữ liệu mẫu (seed) & script reset", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 13, 10, 30)), "Hoàn thành", "https://trello.com/c/FWi2SjO4"],
  [19, "To do 4", "Kiểm thử, tài liệu & triển khai", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 13, 13, 30)), "Hoàn thành", "https://trello.com/c/Pm3nKQim"],
  [20, "To do 4", "AI gợi ý nội dung cá nhân hóa", "Trần Ngọc Quân", new Date(Date.UTC(2026, 9, 13, 14, 30)), "Hoàn thành", "https://trello.com/c/uKeYMhhh"],
];

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Báo cáo");
const detail = workbook.worksheets.add("Chi tiết task");
const fontName = "Arial";
const navy = "#17365D";
const blue = "#2F75B5";
const lightBlue = "#D9EAF7";
const green = "#70AD47";
const lightGreen = "#E2F0D9";
const lightGray = "#E7E6E6";
const darkText = "#1F2937";

summary.showGridLines = false;
summary.tabColor = navy;
summary.getRange("A2:E2").merge();
summary.getRange("A2").values = [["BÁO CÁO TỶ LỆ HOÀN THÀNH TASK NHÓM OREMUS"]];
summary.getRange("A2:E2").format = {
  font: { name: fontName, size: 16, bold: true, color: navy },
  verticalAlignment: "center",
};
summary.getRange("A3:E3").merge();
summary.getRange("A3").values = [["Dữ liệu Trello cập nhật ngày 23/10/2026. Mốc hoàn thành task đến 13/10/2026."]];
summary.getRange("A3:E3").format = { font: { name: fontName, size: 10, italic: true, color: "#5B6573" } };
summary.getRange("A4:E4").format.borders = { bottom: { style: "thin", color: "#A6A6A6" } };

summary.getRange("A6:E6").values = [["Tổng task được giao", "", "Task đã hoàn thành", "", "Tỷ lệ hoàn thành"]];
summary.getRange("A6:E6").format = {
  fill: navy,
  font: { name: fontName, size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A7:E7").values = [[null, null, null, null, null]];
summary.getRange("A7").formulas = [["=B11"]];
summary.getRange("C7").formulas = [["=C11"]];
summary.getRange("E7").formulas = [["=E11"]];
summary.getRange("A7:E7").format = {
  fill: lightBlue,
  font: { name: fontName, size: 14, bold: true, color: darkText },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("E7").format.numberFormat = "0.0%";
summary.getRange("A6:E7").format.borders = { preset: "outside", style: "thin", color: "#9FBAD0" };

summary.getRange("A9:E9").values = [["Thành viên", "Tổng task", "Đã hoàn thành", "Chưa hoàn thành", "% hoàn thành"]];
summary.getRange("A9:E9").format = {
  fill: blue,
  font: { name: fontName, size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#FFFFFF" },
};
summary.getRange("A10").values = [["Trần Ngọc Quân"]];
summary.getRange("B10").formulas = [["=COUNTIFS('Chi tiết task'!$D$6:$D$25,$A10)"]];
summary.getRange("C10").formulas = [["=COUNTIFS('Chi tiết task'!$D$6:$D$25,$A10,'Chi tiết task'!$F$6:$F$25,\"Hoàn thành\")"]];
summary.getRange("D10").formulas = [["=B10-C10"]];
summary.getRange("E10").formulas = [["=IF(B10=0,\"\",C10/B10)"]];
summary.getRange("A11").values = [["TỔNG NHÓM"]];
summary.getRange("B11").formulas = [["=SUM(B10:B10)"]];
summary.getRange("C11").formulas = [["=SUM(C10:C10)"]];
summary.getRange("D11").formulas = [["=SUM(D10:D10)"]];
summary.getRange("E11").formulas = [["=IF(B11=0,\"\",C11/B11)"]];
summary.getRange("A10:E10").format = { font: { name: fontName, size: 10, color: darkText }, verticalAlignment: "center" };
summary.getRange("A11:E11").format = { fill: lightGreen, font: { name: fontName, size: 10, bold: true, color: darkText }, verticalAlignment: "center" };
summary.getRange("A10:E11").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
summary.getRange("B10:D11").format.numberFormat = "#,##0";
summary.getRange("E10:E11").format.numberFormat = "0.0%";
summary.getRange("B10:E11").format.horizontalAlignment = "center";

summary.getRange("A13:E13").merge();
summary.getRange("A13").values = [["Phạm vi tính: 20 thẻ triển khai trong các cột To do 1–4. Không tính 2 thẻ giới thiệu và 15 thẻ Backlog để tránh đếm trùng yêu cầu chức năng."]];
summary.getRange("A13:E13").format = { fill: "#FFF2CC", font: { name: fontName, size: 10, italic: true, color: "#7F6000" }, wrapText: true, verticalAlignment: "center" };
summary.getRange("A15:E15").merge();
summary.getRange("A15").values = [[`Nguồn: Trello – Web design (${boardUrl})`]];
summary.getRange("A15:E15").format = { font: { name: fontName, size: 9, color: "#5B6573" } };

summary.getRange("A1:E15").format.font.name = fontName;
summary.getRange("A1:A15").format.columnWidth = 28;
summary.getRange("B1:D15").format.columnWidth = 18;
summary.getRange("E1:E15").format.columnWidth = 20;
summary.getRange("2:2").format.rowHeight = 28;
summary.getRange("6:7").format.rowHeight = 25;
summary.getRange("9:11").format.rowHeight = 23;
summary.getRange("13:13").format.rowHeight = 38;

detail.showGridLines = false;
detail.tabColor = "#5B9BD5";
detail.getRange("A2:G2").merge();
detail.getRange("A2").values = [["CHI TIẾT TASK TRIỂN KHAI"]];
detail.getRange("A2:G2").format = { font: { name: fontName, size: 16, bold: true, color: navy }, verticalAlignment: "center" };
detail.getRange("A3:G3").merge();
detail.getRange("A3").values = [[`Nguồn: ${boardUrl} | Thời gian hạn hiển thị theo UTC+7`]];
detail.getRange("A3:G3").format = { font: { name: fontName, size: 9, italic: true, color: "#5B6573" } };
detail.getRange("A5:G5").values = [["STT", "Giai đoạn", "Task", "Thành viên", "Hạn hoàn thành", "Trạng thái", "Link Trello"]];
detail.getRange("A5:G5").format = {
  fill: navy,
  font: { name: fontName, size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#FFFFFF" },
};
detail.getRange("A6:G25").values = tasks;
detail.getRange("A6:G25").format = { font: { name: fontName, size: 10, color: darkText }, verticalAlignment: "center" };
detail.getRange("A6:G25").format.borders = { preset: "inside", style: "thin", color: "#E5E7EB" };
detail.getRange("A6:B25").format.horizontalAlignment = "center";
detail.getRange("D6:F25").format.horizontalAlignment = "center";
detail.getRange("E6:E25").format.numberFormat = "dd/mm/yyyy hh:mm";
detail.getRange("F6:F25").format = { fill: lightGreen, font: { name: fontName, size: 10, bold: true, color: "#375623" }, horizontalAlignment: "center", verticalAlignment: "center" };
detail.getRange("A6:G25").conditionalFormats.addCustom("=MOD(ROW(),2)=0", { fill: "#F7FAFC" });
detail.getRange("A1:A25").format.columnWidth = 7;
detail.getRange("B1:B25").format.columnWidth = 14;
detail.getRange("C1:C25").format.columnWidth = 46;
detail.getRange("D1:D25").format.columnWidth = 24;
detail.getRange("E1:E25").format.columnWidth = 21;
detail.getRange("F1:F25").format.columnWidth = 18;
detail.getRange("G1:G25").format.columnWidth = 34;
detail.getRange("2:2").format.rowHeight = 28;
detail.getRange("5:25").format.rowHeight = 22;
detail.freezePanes.freezeRows(5);

workbook.recalculate();

const summaryCheck = await workbook.inspect({
  kind: "table",
  range: "Báo cáo!A2:E15",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
});
const detailCheck = await workbook.inspect({
  kind: "table",
  range: "Chi tiết task!A5:G25",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 8,
});
const errorCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

await fs.mkdir(outputDir, { recursive: true });
const p1 = await workbook.render({ sheetName: "Báo cáo", range: "A1:E15", scale: 2, format: "png" });
await fs.writeFile(previewSummary, new Uint8Array(await p1.arrayBuffer()));
const p2 = await workbook.render({ sheetName: "Chi tiết task", range: "A1:G25", scale: 1.2, format: "png" });
await fs.writeFile(previewDetails, new Uint8Array(await p2.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, previewSummary, previewDetails, summaryCheck: summaryCheck.ndjson, detailCheck: detailCheck.ndjson, errorCheck: errorCheck.ndjson }, null, 2));
