import test from "node:test";
import assert from "node:assert/strict";
import { verify } from "node:crypto";
import { canonicalJson, federationDomain, federationIdentity, signEnvelope } from "../src/federation.js";

test("canonical federation JSON is independent of property insertion order", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), canonicalJson({ a: { x: 3, y: 2 }, z: 1 }));
});

test("federation envelopes carry a valid Ed25519 signature", () => {
  const envelope = signEnvelope({ destination: federationDomain(), type: "test.event", entity_id: "test:one", payload: { ok: true } });
  const { signature, ...unsigned } = envelope;
  assert.equal(envelope.protocol, "libracord-federation");
  assert.equal(verify(null, Buffer.from(canonicalJson(unsigned)), federationIdentity().public_key, Buffer.from(signature, "base64url")), true);
  unsigned.payload.ok = false;
  assert.equal(verify(null, Buffer.from(canonicalJson(unsigned)), federationIdentity().public_key, Buffer.from(signature, "base64url")), false);
});
