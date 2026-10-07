import * as saml from "samlify";
import { origin } from "./config";
export const testAppId = "realestate-saml-test";
export function testEntity() {
  return origin() + "/saml-test-sp";
}
export function testAcs() {
  return origin() + "/api/saml-test";
}
export function testMetadata() {
  return `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${testEntity()}"><md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat><md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${testAcs()}" index="0" isDefault="true"/></md:SPSSODescriptor></md:EntityDescriptor>`;
}
export function testRequest(id: string) {
  return `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${origin()}/api/t/realestate/saml/sso" AssertionConsumerServiceURL="${testAcs()}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" ForceAuthn="true"><saml:Issuer>${testEntity()}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/></samlp:AuthnRequest>`;
}
export function testSp() {
  return saml.ServiceProvider({
    metadata: testMetadata(),
    wantAssertionsSigned: true,
    wantMessageSigned: true,
  });
}
