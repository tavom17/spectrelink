import crypto, { createDecipheriv } from "node:crypto"


export function encrypt (masterSecret: string, userSalt: string, toEncrypt: string ): string{
const key = crypto.scryptSync(masterSecret, userSalt, 32);
const IV = crypto.randomBytes(12);
const cypher = crypto.createCipheriv("aes-256-gcm",key,IV);

const encrypted= Buffer.concat([cypher.update(toEncrypt, "utf8"),cypher.final()]);
const authTag = cypher.getAuthTag();

const IVstring = IV.toString("base64");
const encryptedString = encrypted.toString("base64");
const authTagString = authTag.toString("base64");

const toSave: string = `${IVstring}:${authTagString}:${encryptedString}`;

return toSave; 
}

export function decrypt (encryptedString: string, masterSecret: string, userSalt: string): string{
//seperate toSave from encryption section
    const [ivString, authTagString, encryptedDataString] : string[] = encryptedString.split(':');

//from base64 back to buffer
const IV : Buffer = Buffer.from(ivString, 'base64');
const authTag : Buffer = Buffer.from(authTagString, 'base64');
const encryptedData : Buffer = Buffer.from(encryptedDataString, 'base64');

//deriving the key for decryption
const key = crypto.scryptSync(masterSecret, userSalt, 32);

const decipher = crypto.createDecipheriv("aes-256-gcm",key,IV).setAuthTag(authTag);
const decrypted= Buffer.concat([decipher.update(encryptedData),decipher.final()]);

const finalString = decrypted.toString('utf-8');
return finalString;
}
