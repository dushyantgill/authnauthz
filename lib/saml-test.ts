import * as saml from "samlify";
import { origin } from "./config";
export const testAppId = "realestate-saml-test";
export function testEntity(t = "realestate") {
  return origin() + "/saml-test-sp" + (t === "realestate" ? "" : "/" + t);
}
export function testAcs(t = "realestate") {
  return (
    origin() + "/api/saml-test" + (t === "realestate" ? "" : "?tenant=" + t)
  );
}
export function testMetadata(t = "realestate") {
  return `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${testEntity(t)}"><md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat><md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${testAcs(t)}" index="0" isDefault="true"/></md:SPSSODescriptor></md:EntityDescriptor>`;
}
export function testRequest(id: string, t = "realestate") {
  return `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${origin()}/api/t/${t}/saml/sso" AssertionConsumerServiceURL="${testAcs(t)}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" ForceAuthn="true"><saml:Issuer>${testEntity(t)}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/></samlp:AuthnRequest>`;
}
export function testSp(t = "realestate") {
  return saml.ServiceProvider({
    metadata: testMetadata(t),
    wantAssertionsSigned: true,
    wantMessageSigned: true,
  });
}
