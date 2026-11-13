# Tập tin

- [Bàn 3D và camera](board-3d.md) - Shared grid, scene ownership, camera gestures and local preview boundaries
- [HUD ván chơi và adapter preview](gameplay-ui.md) - Route HUD Monopoly 24 trạng thái, quyền hiển thị theo lượt, ranh giới với bàn 3D cục bộ và backend Monopoly chưa triển khai; mô tả theo source hiện tại.
- [Kiến trúc hub và đồng bộ phòng](hub.md) - Luồng giao diện mobile, luật phòng thuần, adapter bản thử và Firebase, quyền truy cập và giới hạn trước khi có bàn chơi.
- [Target infrastructure transition](infrastructure-transition.md) - Ranh giới hạ tầng staging và kiểm chứng runtime của hub.
- [Kinh tế biển và chợ cá](ocean-economy.md) - Ví xu, sổ cá chưa bán và bảng giá trên server qua ba RPC; chợ cá và người bán ở phía client; ranh giới client báo cáo và trạng thái migration còn pending.
- [Câu cá, cuộc giằng co và vật lý thuyền](ocean-fishing.md) - Luật câu cá thuần (vùng biển, lượt ném, cắn câu, 15 loài), máy trạng thái cuộc giằng co, cần câu và dây như lò xo/Verlet, vật lý thuyền Havok, lưu cá trên thiết bị, và ranh giới client báo cáo cá.
- [Realtime biển: Socket.IO, Firestore và đồng bộ thuyền](ocean-realtime.md)
- [Biển đánh cá chung: tổng quan và ranh giới](ocean.md)
