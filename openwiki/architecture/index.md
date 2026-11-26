# Tập tin

- [Hub, đăng nhập và vào biển](hub.md) - Hub (bến cảng) là màn hình đầu tiên: hiển thị thuyền trưởng, mở hộp thoại tài khoản Supabase và chỉ tải động cơ biển khi người chơi bấm Ra khơi và đã có phiên đăng nhập.
- [Chuyển hạ tầng: Supabase, Render, Vercel](infrastructure-transition.md) - Phân vai ba dịch vụ hiện hành (Vercel cho frontend, Render cho API Socket.IO, Supabase cho Auth và PostgreSQL kinh tế), cấu hình công khai và giới hạn; Firebase và game cờ tỷ phú đã gỡ.
- [Kinh tế biển và chợ cá](ocean-economy.md) - Ví xu, sổ cá chưa bán, hồ sơ, thuyền/cần/mồi đã mua và bảng xếp hạng nằm trên server Supabase qua các RPC công khai; chợ và người bán ở client; database quyết định giá, số dư và giới hạn, còn báo cáo cá bắt vẫn do client gửi.
- [Câu cá, cuộc giằng co và vật lý thuyền](ocean-fishing.md) - Luật câu cá thuần (vùng biển, lượt ném, nibble và cắn câu, 10 loài câu được, mồi ảnh hưởng xác suất), máy trạng thái cuộc giằng co, cần câu và dây, vật lý thuyền Havok, kho cá trên server khi có hồ sơ hoặc trên thiết bị, và ranh giới client báo cáo cá.
- [Bản đồ: minimap và bản đồ toàn màn hình](ocean-map.md)
- [Thuyền đậu khi ngoại tuyến](ocean-parked-boats.md) - Thuyền của người chơi không online vẫn nằm ở vị trí cuối cùng trên biển chung; vị trí đọc từ hồ sơ Supabase bằng token của chính người chơi, giữ tối đa 7 ngày, TTL đọc 60 giây; khi người chơi trở lại thì thuyền không còn đậu nữa.
- [Biển realtime: Socket.IO, server và đồng bộ](ocean-realtime.md) - Biển chung là một Socket.IO server trên API Render, trạng thái trong bộ nhớ của một tiến trình: xác thực token Supabase, vào biển, giao thức 2 (delta mỗi 200 ms) và giao thức 1 cũ, kiểm tra lại phiên, làm mới token, cấp lại tầng thuyền và thuyền đậu, và kết nối lại trong 90 giây.
- [Biển, bầu trời, đảo, thuyền và nước trong](ocean-rendering.md)
- [Âm thanh biển](ocean-sound.md)
- [Thuyền NPC: tàu tuần tra, thủy phi cơ và thuyền mèo](ocean-traffic.md)
- [Biển chung: tổng quan và ranh giới](ocean.md)
