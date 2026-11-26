---
type: "Tham khảo"
title: "Âm thanh biển"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
sources:
  - id: openwiki-source-23b606bc800ebce63120a7f7
    resource: repo://src/app/audio.ts
  - id: openwiki-source-a223cf6984f4629d18b74752
    resource: repo://src/ocean/audio-plan.ts
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---


# Âm thanh biển

Âm thanh của biển chung được tách thành các phần số thuần để kiểm thử không cần card âm thanh, và một lớp Web Audio mỏng để phát. Quy tắc nằm ở `src/ocean/`, lớp phát ở `src/app/audio.ts`, cài đặt ở `src/app/settings-audio.ts`.

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Kế hoạch âm thanh | `src/ocean/audio-plan.ts` | `soundPlan(input)`: từ tốc độ, mưa, mây, độ căng dây, bờ, máy bay và ban ngày ra một `SoundPlan` gồm âm lượng và độ cắt của từng lớp. |
| Tín hiệu ngắn | `src/ocean/audio-cues.ts` | Bảng `CUES` mô tả mỗi tín hiệu (`cast`, `nibble`, `hook`, `catch`, `buy`, `gull`…) như các “voice”: tông (có trượt), hoặc nhiễu lọc; `cueVoices`, `cueLength`. |
| Tiếng sống | `src/ocean/audio-life.ts` | `gullIn` (lúc nào có tiếng hải âu), `musicBar` (nhạc nền theo nốt, ban ngày hoặc ban đêm), `shoreDistance` (khoảng cách tới bãi), `seeded` (mulberry32). |
| Lớp Web Audio | `src/app/audio.ts` | `createSeaAudio()`: tạo `AudioContext`, các nút gain và lọc, phát tín hiệu, giới hạn số tiếng cùng lúc. |
| Cài đặt | `src/app/settings-audio.ts` | Thẻ “Âm thanh” trong màn Cài đặt: bật/tắt, âm lượng và nhạc nền, lưu trên thiết bị. |
| Nối với biển | `src/app/ocean.ts` | Truyền trạng thái thuyền vào `seaAudio.update(...)`; `sound: (cue) => seaAudio.play(cue)` cho cuộc câu và hub; `seaAudio.dispose()` khi rời biển. |

## Kế hoạch âm thanh

`soundPlan` nhận `SoundInput` (tốc độ theo m/s, mưa 0..1, mây u ám 0..1, độ căng dây 0..1, âm lượng, bật/tắt, khoảng cách tới bờ, khoảng cách tới máy bay, ban ngày 0..1) và trả về:

- **Sóng** (`swell`): luôn có một tiếng rì rầm nhẹ; tốc độ và thời tiết xấu làm nó to và sáng hơn.
- **Gió** (`wind`): tăng theo mây u ám và tốc độ.
- **Mưa** (`rain`): chỉ khi trời mưa.
- **Động cơ** (`engine`, `enginePitch`): tiếng ù thấp khi đứng yên; cao độ theo tốc độ (`REFERENCE_SPEED` = 18 m/s, cùng hằng với vật lý).
- **Dây câu** (`line`, `linePitch`): chỉ nghe khi dây thật sự căng (độ căng trên 0,25), càng gần đứt càng cao.
- **Thân tàu rẽ nước** (`hull`): tiếng nước bắn chỉ khi thuyền thật sự chạy.
- **Sóng vỗ bờ** (`surf`): to dần khi thuyền tới gần bãi; nghe được từ 170 m, đầy đủ trong 25 m (`SURF_RANGE`).
- **Máy bay thủy phi cơ** (`plane`): nghe được từ 300 m, đầy đủ trong 40 m (`PLANE_RANGE`), nhờ khoảng cách tới máy bay gần nhất.

Khi tắt âm thanh hoặc âm lượng bằng 0, kế hoạch là `SILENT` (mọi lớp bằng 0). Mọi số đầu vào được kẹp về khoảng hợp lệ, nên số không hữu hạn không làm hỏng âm thanh.

## Tín hiệu ngắn

`CUES` gồm 18 tín hiệu: thả cần (`cast`), tõm nước (`splash`), cá đớp nhẹ (`nibble`), cắn câu (`bite`), giật cần (`hook`), cá thoát (`escape`), dây đứt (`snap`), bắt được (`catch`), giữ cá (`keep`), thả cá (`drop`), ném bị chặn (`blocked`), xu (`coin`), lỗi (`error`), chạm (`tap`), mở và đóng hộp thoại (`open`, `close`), mua (`buy`) và hải âu (`gull`). Mỗi tín hiệu là vài “voice”: một tông (sóng sin, tam giác, vuông hoặc răng cưa, có thể trượt từ cao độ này sang cao độ khác) hoặc một đoạn nhiễu lọc, với thời điểm bắt đầu, độ dài và độ to.

`src/app/audio.ts` chuyển các voice đó thành nút Web Audio. Số tiếng cùng lúc bị giới hạn ở `MAX_VOICES` = 24, để một loạt sự kiện không xếp chồng tiếng.

## Tiếng sống

- **Hải âu**: `gullIn` trả số giây tới tiếng kêu tiếp theo; gần bãi vào ban ngày thì cứ 5 đến 17 giây, xa bờ hiếm khi có, ban đêm không có. Hạt giống ngẫu nhiên (`seeded`, mulberry32) làm chuỗi tiếng ổn định khi kiểm thử.
- **Nhạc nền**: `musicBar` cho một ô nhịp 8 giây (`BAR_SECONDS`) gồm các nốt có thời điểm, độ dài và tần số. Ban ngày dùng gốc âm nhạc khác ban đêm (theo `daylight` > 0,5). Nhạc nền nhẹ và có thể tắt trong Cài đặt.

## Lớp Web Audio và vòng đời

- `AudioContext` chỉ được tạo sau cử chỉ đầu tiên của người chơi (`pointerdown`, `keydown` hoặc `touchend`), vì trình duyệt chặn âm thanh trước đó.
- Khi tab bị ẩn, ngữ cảnh bị tạm dừng; khi hiện lại và âm thanh đang bật, ngữ cảnh được tiếp tục.
- Các giá trị thay đổi theo thời gian được đưa vào bằng `setTargetAtTime`, nên không có tiếng giật khi đổi.
- `dispose()` đóng ngữ cảnh và gỡ các bộ lắng nghe khi rời biển.

## Cài đặt

Cài đặt lưu trong localStorage với khóa `photyphu:audio:v1`: `enabled` (mặc định bật), `volume` (mặc định 0,7, được kẹp về 0 đến 1) và `music` (mặc định bật). Giá trị đọc lại không hợp lệ được thay bằng mặc định. Cài đặt này là của thiết bị, không gửi lên server.

## Kiểm thử

- `tests/audio-plan.test.mjs`: kế hoạch theo tốc độ, thời tiết, dây căng, bờ, máy bay và công tắc tắt.
- `tests/audio-cues.test.mjs`: bảng tín hiệu và độ dài.
- `tests/audio-life.test.mjs`: hải âu, nhạc nền và khoảng cách bờ.
- `tests/ocean-audio-browser.mjs`: trong trình duyệt thật (cần máy chủ phát triển), kiểm tra các lớp được tạo không lỗi, nhạc nền phát sau cử chỉ và dừng khi tắt trong Cài đặt, và tín hiệu mở hộp thoại.

Chưa có bằng chứng về âm lượng, độ trễ và hành vi mở khóa âm thanh trên điện thoại thật (iOS Safari, Android Chrome). Đây là việc kiểm tra thiết bị cần làm.
