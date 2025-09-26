// plugins/crypto/sync/priceAxisSync.js
// NOTE: 구현은 shared 모듈로 승격되었고, crypto 경로에서는 재수출만 합니다.
// 기존 코드가 default 또는 named import를 모두 사용할 수 있도록 둘 다 재수출합니다.

export { default } from "../../shared/sync/priceAxisSync.js"; // default import 호환
export * from "../../shared/sync/priceAxisSync.js";          // named import 호환
