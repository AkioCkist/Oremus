import crypto from 'node:crypto';
import { HashAlgorithm, InpOrderAlreadyConfirmed, IpnFailChecksum, IpnInvalidAmount, IpnOrderNotFound, IpnSuccess, IpnUnknownError, ProductCode, VnpLocale, VNPay } from 'vnpay';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { PaymentOrder } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { applyLedger } from './ads.service.js';

export const paymentsEnabled = () => !!(env.VNPAY_TMN_CODE && env.VNPAY_HASH_SECRET);

let client: VNPay | undefined;
function vnpay(): VNPay {
  client ??= new VNPay({ tmnCode: env.VNPAY_TMN_CODE, secureSecret: env.VNPAY_HASH_SECRET, vnpayHost: env.VNPAY_HOST, testMode: env.VNPAY_HOST.includes('sandbox'), hashAlgorithm: HashAlgorithm.SHA512 });
  return client;
}

const returnUrl = () => env.VNPAY_RETURN_URL || `${env.APP_ORIGIN[0]}/payments/vnpay/return`;

/** Creates a pending order and the VNPay page to pay it on. Nothing is credited until VNPay confirms by IPN. */
export async function startTopUp(userId: string, amount: number, ip: string) {
  if (!paymentsEnabled()) throw new AppError(503, 'Online payment is not set up yet. Ask an administrator to top up your wallet.', 'PAYMENTS_DISABLED');
  const txnRef = crypto.randomBytes(12).toString('hex');
  await PaymentOrder.create({ userId, provider: 'vnpay', txnRef, amount, status: 'pending' });
  const url = vnpay().buildPaymentUrl({
    vnp_Amount: amount,
    vnp_IpAddr: ip,
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Oremus ad wallet top-up ${txnRef}`,
    vnp_OrderType: ProductCode.Other,
    vnp_ReturnUrl: returnUrl(),
    vnp_Locale: VnpLocale.VN
  });
  return { url, txnRef };
}

/**
 * VNPay's server-to-server confirmation: the only thing that adds money to a wallet.
 * It may arrive more than once, so each step is safe to repeat.
 */
export async function handleIpn(query: Record<string, unknown>) {
  let verified;
  try { verified = vnpay().verifyIpnCall(query as any); }
  catch (error) { logger.warn({ error }, 'Unreadable VNPay IPN'); return IpnFailChecksum; }
  if (!verified.isVerified) return IpnFailChecksum;
  try {
    const order = await PaymentOrder.findOne({ provider: 'vnpay', txnRef: String(verified.vnp_TxnRef) });
    if (!order) return IpnOrderNotFound;
    if (Number(verified.vnp_Amount) !== order.amount) return IpnInvalidAmount;
    if (order.status === 'paid') return InpOrderAlreadyConfirmed;
    if (!verified.isSuccess) {
      order.status = 'failed'; order.providerCode = String(verified.vnp_ResponseCode ?? '');
      await order.save();
      return IpnSuccess;
    }
    await applyLedger({ userId: String(order.userId), type: 'topup', amount: order.amount, key: `vnpay:${order.txnRef}`, refType: 'PaymentOrder', refId: order._id, note: 'VNPay top-up' });
    order.status = 'paid'; order.paidAt = new Date(); order.providerTxn = String(verified.vnp_TransactionNo ?? ''); order.providerCode = String(verified.vnp_ResponseCode ?? '');
    await order.save();
    return IpnSuccess;
  } catch (error) {
    // Tells VNPay to retry later rather than losing the payment.
    logger.error({ error, txnRef: verified.vnp_TxnRef }, 'VNPay IPN could not be processed');
    return IpnUnknownError;
  }
}

/** Only used to tell the buyer how it went. A browser can fake this URL, so it never changes any money. */
export function readReturn(query: Record<string, unknown>): 'success' | 'failed' {
  try {
    const verified = vnpay().verifyReturnUrl(query as any);
    return verified.isVerified && verified.isSuccess ? 'success' : 'failed';
  } catch { return 'failed'; }
}
