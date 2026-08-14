import { isoBase64URL, isoCBOR, isoUint8Array } from '@simplewebauthn/server/helpers'

// ---------------------------------------------------------------------------
// Test-only WebAuthn authenticator simulator — builds syntactically valid
// registration / authentication responses against a real ECDSA P-256 keypair
// (WebCrypto), so integration tests can run full ceremonies over HTTP without
// a browser. Attestation format: "none" (fmt "none" has no attStmt signature
// to produce; the authData carries the credential public key).
// ---------------------------------------------------------------------------

// TS 5.7 typed-array 泛型：WebCrypto API 要求 ArrayBuffer 后备的视图。
type Bytes = Uint8Array<ArrayBuffer>

export type TestAuthenticator = {
  /** WebAuthn credential ID（base64url）。 */
  credentialId: string
  /** COSE-encoded EC2 public key bytes（服务端存储的形态）。 */
  publicKey: Bytes
  keyPair: CryptoKeyPair
}

async function sha256(bytes: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

function b64url(bytes: Bytes): string {
  return isoBase64URL.fromBuffer(bytes)
}

function concat(arrays: Bytes[]): Bytes {
  return isoUint8Array.concat(arrays)
}

/** 生成一把「虚拟设备」：EC2 P-256 密钥对 + COSE 公钥 + credential id。 */
export async function createTestAuthenticator(): Promise<TestAuthenticator> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  // Buffer → Uint8Array 拷贝（ArrayBuffer 后备），满足 TS 5.7 的泛型约束
  const x = Uint8Array.from(Buffer.from(jwk.x!, 'base64url'))
  const y = Uint8Array.from(Buffer.from(jwk.y!, 'base64url'))
  const cosePublicKey = isoCBOR.encode(
    new Map<number, string | number | Bytes>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, x],
      [-3, y],
    ]),
  )
  const credIdBytes = crypto.getRandomValues(new Uint8Array(32))
  return {
    credentialId: b64url(credIdBytes),
    publicKey: new Uint8Array(cosePublicKey),
    keyPair,
  }
}

function buildClientDataJSON(opts: {
  type: 'webauthn.create' | 'webauthn.get'
  challenge: string
  origin: string
}): Bytes {
  return isoUint8Array.fromUTF8String(
    JSON.stringify({
      type: opts.type,
      // 与真实浏览器一致：clientDataJSON.challenge = 服务端 options.challenge
      // 原样值（该值已是 base64url 编码，见 generateRegistrationOptions 对
      // string challenge 的 utf8→base64url 处理）。
      challenge: opts.challenge,
      origin: opts.origin,
      crossOrigin: false,
    }),
  )
}

/**
 * 模拟注册（create ceremony）响应：
 * authData = rpIdHash | flags(UP|UV|AT=0x45) | signCount(0) | AAGUID(16×0) |
 *            credIdLen(2) | credId | COSE 公钥
 * attestationObject = { fmt: "none", attStmt: {}, authData }
 */
export async function simulateRegistration(opts: {
  rpID: string
  origin: string
  challenge: string
  authenticator: TestAuthenticator
}): Promise<{
  id: string
  rawId: string
  type: 'public-key'
  response: { clientDataJSON: string; attestationObject: string }
  clientExtensionResults: Record<string, unknown>
  transports: string[]
}> {
  const { rpID, origin, challenge, authenticator } = opts
  const clientDataJSON = buildClientDataJSON({ type: 'webauthn.create', challenge, origin })

  const credIdBytes = isoBase64URL.toBuffer(authenticator.credentialId)
  const credIdLen = new Uint8Array([0, credIdBytes.length])
  const authData = concat([
    await sha256(isoUint8Array.fromUTF8String(rpID)),
    new Uint8Array([0x45]), // UP | UV | AT
    new Uint8Array([0, 0, 0, 0]), // signCount = 0
    new Uint8Array(16), // AAGUID
    credIdLen,
    credIdBytes,
    authenticator.publicKey,
  ])
  const attestationObject = isoCBOR.encode(
    new Map<string, string | Map<string, never> | Bytes>([
      ['fmt', 'none'],
      ['attStmt', new Map<string, never>()],
      ['authData', authData],
    ]),
  )
  return {
    id: authenticator.credentialId,
    rawId: authenticator.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: b64url(clientDataJSON),
      attestationObject: b64url(attestationObject),
    },
    clientExtensionResults: {},
    transports: ['internal'],
  }
}

/**
 * ECDSA 原始 R||S（WebCrypto 输出）→ DER 编码（WebAuthn 标准要求浏览器输出
 * ASN.1 DER，@simplewebauthn/server 的 unwrapEC2Signature 只认 DER）。
 */
function rawRSToDER(r: Bytes, s: Bytes): Bytes {
  const encodeInteger = (bytes: Bytes): Bytes => {
    // DER INTEGER：高位为 1 时前置 0x00 表示正数
    let body = bytes
    if (body[0] & 0x80) {
      body = concat([new Uint8Array([0x00]), body])
    }
    return concat([new Uint8Array([0x02, body.length]), body])
  }
  const contents = concat([encodeInteger(r), encodeInteger(s)])
  return concat([new Uint8Array([0x30, contents.length]), contents])
}

/**
 * 模拟登录（get ceremony）响应：
 * authenticatorData = rpIdHash | flags(UP|UV=0x05) | signCount(4)
 * signature = ECDSA(P-256) DER 签名 over SHA-256(authenticatorData || clientDataHash)
 */
export async function simulateAuthentication(opts: {
  rpID: string
  origin: string
  challenge: string
  authenticator: TestAuthenticator
  counter: number
}): Promise<{
  id: string
  rawId: string
  type: 'public-key'
  response: { clientDataJSON: string; authenticatorData: string; signature: string }
  clientExtensionResults: Record<string, unknown>
}> {
  const { rpID, origin, challenge, authenticator, counter } = opts
  const clientDataJSON = buildClientDataJSON({ type: 'webauthn.get', challenge, origin })

  const signCount = new Uint8Array([
    (counter >>> 24) & 0xff,
    (counter >>> 16) & 0xff,
    (counter >>> 8) & 0xff,
    counter & 0xff,
  ])
  const authenticatorData = concat([
    await sha256(isoUint8Array.fromUTF8String(rpID)),
    new Uint8Array([0x05]), // UP | UV
    signCount,
  ])
  const clientDataHash = await sha256(clientDataJSON)
  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      authenticator.keyPair.privateKey,
      concat([authenticatorData, clientDataHash]),
    ),
  )
  const signature = rawRSToDER(rawSignature.slice(0, 32), rawSignature.slice(32, 64))
  return {
    id: authenticator.credentialId,
    rawId: authenticator.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: b64url(clientDataJSON),
      authenticatorData: b64url(authenticatorData),
      signature: b64url(signature),
    },
    clientExtensionResults: {},
  }
}
