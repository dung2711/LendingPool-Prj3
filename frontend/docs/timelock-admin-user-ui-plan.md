# Kế hoạch tích hợp Timelock vào UI quản trị và UI theo dõi proposal

## 1. Mục tiêu

Xây dựng 2 nhóm giao diện riêng:
- UI Admin: thao tác tất cả hàm quản trị protocol mà không cần vào Safe UI.
- UI User (non-admin): chỉ xem proposal đang chờ ký, proposal đã vào timelock queue, thời gian chờ còn lại, min delay hiện tại.

Quan trọng: tất cả hành động admin phải đi qua luồng Safe + ProtocolTimelock, không gọi trực tiếp ProtocolController nữa.

## 2. Trạng thái hiện tại

Hiện tại frontend đã có:
- Trang admin: frontend/app/admin/page.tsx
- Service multisig: frontend/services/SafeMultisigService.ts

Vấn đề hiện tại:
- Safe transaction đang target trực tiếp ProtocolController.
- Chưa có bước schedule/execute của ProtocolTimelock.
- Chưa có màn hình read-only cho user để theo dõi timelock queue.

## 3. Kiến trúc mục tiêu

Luồng chuẩn cho mọi action admin:
1. Admin điền form trên UI.
2. Frontend encode calldata của ProtocolController function.
3. Frontend bọc calldata đó vào ProtocolTimelock.schedule(...).
4. Frontend propose Safe transaction với target = ProtocolTimelock.
5. Safe owners xác nhận đủ threshold.
6. Một owner execute Safe tx để gọi schedule trên timelock.
7. Operation vào queue, chờ đủ min delay.
8. Sau khi ready, tạo Safe tx thứ 2 gọi ProtocolTimelock.execute(...).
9. Sau khi execute xong, ProtocolController function mới thực thi thành công.

Ghi chú:
- Timelock hiện deploy với executor mở (address zero), nghĩa là ai cũng có thể gọi execute khi đủ delay.
- Tuy nhiên để đồng nhất luồng quản trị, vẫn nên để UI admin tạo execute proposal qua Safe.

## 4. Thay đổi bắt buộc về cấu hình

Cập nhật frontend/.env.example thêm:
- NEXT_PUBLIC_PROTOCOL_TIMELOCK_ADDRESS=0x

Giữ nguyên các biến đang có:
- NEXT_PUBLIC_SAFE_ADDRESS
- NEXT_PUBLIC_PROTOCOL_CONTROLLER_ADDRESS
- NEXT_PUBLIC_CHAIN_ID
- NEXT_PUBLIC_SAFE_API_KEY

Không hardcode min delay trong frontend. Luôn đọc từ chain bằng ProtocolTimelock.getMinDelay().

## 5. Refactor service multisig

### 5.1 Mục tiêu refactor

Trong frontend/services/SafeMultisigService.ts:
- Giữ encode ProtocolController function như hiện tại.
- Bổ sung encode Timelock function:
  - schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)
  - execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)
  - hashOperation(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)
  - getMinDelay()
  - getTimestamp(bytes32 id)
  - isOperationPending(bytes32 id)
  - isOperationReady(bytes32 id)
  - isOperationDone(bytes32 id)

### 5.2 API service mới nên có

Đề xuất tách rõ các nhóm hàm:

A) Hàm tạo proposal schedule:
- proposeTimelockSchedule(controllerData, metadata?)

Input:
- controllerData: calldata đã encode của ProtocolController function.
- predecessor: mặc định bytes32 zero.
- salt: sinh từ timestamp + functionName + params hash để tránh đụng.

Flow:
1. Đọc minDelay từ timelock.
2. Encode schedule.
3. Propose Safe transaction với target = timelock.
4. Trả về safeTxHash + operationId + eta dự kiến.

B) Hàm tạo proposal execute:
- proposeTimelockExecute(controllerData, predecessor, salt)

Flow:
1. Encode execute.
2. Propose Safe transaction với target = timelock.
3. Trả về safeTxHash + operationId.

C) Hàm đọc trạng thái operation:
- getOperationState(operationId)
- getOperationETA(operationId)
- getTimelockMinDelay()

D) Hàm helper encode sẵn cho từng action admin:
- proposeSupportMarketViaTimelock(...)
- proposeSetLiquidateParamsViaTimelock(...)
- proposeSetPriceViaTimelock(...)
- ...

Mỗi hàm helper:
1. Encode calldata của ProtocolController.
2. Gọi proposeTimelockSchedule.

### 5.3 Cấu trúc dữ liệu mới

Thêm type thống nhất để dùng cho cả admin/user UI:

GovernanceAction
- title
- controllerFunctionName
- controllerData
- safeScheduleTxHash
- safeExecuteTxHash (nullable)
- operationId
- salt
- predecessor
- createdAt
- eta
- state: PendingSignature | Scheduled | Ready | Executed | Cancelled

TimelockQueueItem
- operationId
- target
- value
- data
- predecessor
- salt
- minDelay
- scheduledTimestamp
- readyAt
- isPending
- isReady
- isDone

## 6. Nâng cấp UI Admin

File chính: frontend/app/admin/page.tsx

### 6.1 Mục tiêu UX

Mỗi thao tác admin phải có 2 bước tách rõ:
- Step 1: Propose Schedule
- Step 2: Propose Execute (chỉ bật khi operation đã ready)

### 6.2 Thành phần UI cần thêm

1) Khối Timelock status:
- Timelock address
- Min delay (giây, giờ)
- Executor mode (open/restricted)

2) Khối Action form (đã có, giữ lại):
- Form input theo từng function.
- Nút Propose Schedule thay cho nút propose hiện tại.

3) Khối Timelock queue cho admin:
- Danh sách operation đã schedule.
- Countdown tới thời điểm ready.
- Nút Propose Execute khi ready.
- Badge trạng thái Pending/Ready/Done.

4) Khối Safe pending tx (đã có, tái sử dụng):
- Ký và execute các Safe tx như hiện tại.

### 6.3 Validation bắt buộc

- Validate address với ethers.isAddress.
- Validate số theo decimals và scale chuẩn trước khi encode.
- Chặn submit nếu chưa load xong min delay.
- Hiển thị rõ tx đang tạo là schedule hay execute để tránh nhầm.

## 7. Tạo UI User (read-only)

Tạo route mới:
- frontend/app/governance/page.tsx

Mục tiêu:
- Không cần quyền owner.
- Chỉ đọc dữ liệu và trạng thái governance.

### 7.1 Dữ liệu cần hiển thị

1) Safe proposals đang pending:
- safeTxHash
- action name (decode nếu được)
- số chữ ký hiện tại / required
- submission date

2) Timelock operations:
- operationId
- action name
- scheduled time
- readyAt
- thời gian còn lại
- trạng thái Pending/Ready/Done

3) Timelock info:
- min delay
- proposer role mode
- executor mode (open executor)

### 7.2 Nguồn dữ liệu

- Safe pending tx: từ Safe Transaction Service API (đã có).
- Timelock queue/state: đọc onchain bằng provider + event + view functions.

### 7.3 Polling và refresh

- Poll mỗi 15-30 giây cho pending tx và operation state.
- Nút refresh thủ công.
- Tránh gọi quá dày để không bị rate-limit API.

## 8. Cách map Safe proposal với Timelock operation

Đây là phần khó nhất cần chuẩn hóa ngay từ đầu.

Khuyến nghị:
- Khi tạo schedule proposal, lưu metadata local:
  - action name
  - controllerData
  - predecessor
  - salt
  - operationId
  - safeTxHash
- Có thể lưu ở backend DB; nếu chưa có backend thì lưu localStorage tạm thời (chỉ để dev).

Vì sao cần metadata:
- Safe API không tự hiểu operationId của timelock.
- Nếu không lưu salt/predecessor thì rất khó tạo execute chính xác về sau.

## 9. Tránh lỗi bảo mật và vận hành

1) Không cho UI encode function ngoài whitelist.
- Chỉ cho phép các function admin đã định nghĩa sẵn.
- Không cho nhập function signature tùy ý.

2) Luôn hiển thị target cuối cùng của action.
- Người dùng phải thấy rõ đây là call tới timelock, không phải controller trực tiếp.

3) Trước khi propose execute, luôn kiểm tra state onchain.
- Nếu chưa ready thì disable nút execute.

4) Chuẩn hóa thông báo lỗi.
- Phân biệt lỗi Safe API, lỗi signer, lỗi chain RPC, lỗi timelock state.

5) Theo dõi lệch chain.
- Nếu ví đang ở sai chain, chặn mọi thao tác propose/sign/execute.

## 10. Lộ trình triển khai theo phase

### Phase A: Core service timelock
- Thêm timelock env var.
- Refactor SafeMultisigService sang target timelock.
- Tạo helper schedule/execute/hashOperation/state.
- Đảm bảo các function hiện có đều đi qua schedule.

Tiêu chí hoàn thành:
- Không còn function nào propose trực tiếp ProtocolController.

### Phase B: Admin UI timelock-aware
- Đổi nút propose hiện tại thành Propose Schedule.
- Thêm bảng operation queue + countdown.
- Thêm hành động Propose Execute khi Ready.

Tiêu chí hoàn thành:
- Có thể hoàn thành full flow schedule -> sign -> execute schedule -> wait -> propose execute -> sign -> execute execute.

### Phase C: User governance UI
- Tạo trang governance read-only.
- Hiển thị pending proposals + timelock queue + min delay.

Tiêu chí hoàn thành:
- User không phải owner vẫn theo dõi đầy đủ trạng thái governance.

### Phase D: Hardening
- Decode action name thân thiện.
- Retry/polling tối ưu.
- Xử lý edge case khi operation đã done nhưng Safe tx cũ còn pending.

## 11. Checklist file cần thay đổi

Bắt buộc:
- frontend/services/SafeMultisigService.ts
- frontend/app/admin/page.tsx
- frontend/.env.example

Nên thêm mới:
- frontend/services/TimelockService.ts
- frontend/types/governance.ts
- frontend/hooks/useGovernanceData.ts
- frontend/app/governance/page.tsx
- frontend/components/governance/TimelockQueueTable.tsx
- frontend/components/governance/SafePendingTable.tsx

## 12. Acceptance criteria chi tiết

1) Với admin:
- Có thể tạo schedule proposal cho mọi hàm admin đang hỗ trợ.
- Có thể ký/execute safe tx schedule.
- Thấy operation vào queue, có countdown.
- Khi ready, tạo execute proposal thành công.
- Execute xong thì operation chuyển done.

2) Với non-admin:
- Truy cập được trang governance mà không cần owner role.
- Xem được pending safe proposals.
- Xem được timelock operations và thời gian chờ.
- Xem được min delay hiện tại từ onchain.

3) Về kỹ thuật:
- Không còn call trực tiếp ProtocolController ở frontend governance flow.
- Toàn bộ admin action đều target ProtocolTimelock.

## 13. Gợi ý thứ tự implement thực tế (ngắn gọn)

1. Thêm timelock address vào env và service.
2. Viết xong 2 primitive:
- proposeTimelockSchedule
- proposeTimelockExecute
3. Chuyển 1 action mẫu (setPrice) sang timelock flow để verify end-to-end.
4. Sau khi chạy ổn, migrate toàn bộ action còn lại.
5. Làm governance read-only page.
6. Cuối cùng tối ưu UX và thông báo lỗi.

---

Nếu bạn muốn, bước tiếp theo tôi có thể triển khai luôn Phase A trực tiếp trong codebase: refactor SafeMultisigService theo đúng luồng timelock trước, sau đó cập nhật admin page để dùng API mới.
