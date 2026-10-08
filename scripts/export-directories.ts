import { mkdirSync, writeFileSync } from "node:fs";
import { archetypes, seeds } from "../lib/archetypes";
const root = "exports/directories";
const csv = (rows: Record<string, unknown>[], fields: string[]) => [fields.join(","), ...rows.map(r => fields.map(k => '"' + String(r[k] ?? "").replaceAll('"', '""') + '"').join(","))].join("\r\n") + "\r\n";
for (const [tenant, seed] of Object.entries(seeds)) {
 const dir = root + "/" + tenant; mkdirSync(dir, {recursive:true});
 const users = seed.users.map(u => ({...u, managerId: u.manager || "", employeeType:u.userType, email:u.userName, photoFile:"photos/" + u.userName.split("@")[0] + ".jpg"}));
 const groups = seed.groups.map(g => ({id:g.id,displayName:g.displayName,kind:g.kind,memberCount:g.members.length,memberIds:g.members.map(m=>m.value).join(";")}));
 const memberships = seed.groups.flatMap(g => g.members.map(m => ({groupId:g.id,groupName:g.displayName,userId:m.value,userDisplayName:m.display})));
 const scimUsers = seed.users.map(u => ({schemas:["urn:ietf:params:scim:schemas:core:2.0:User","urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"], id:u.id,userName:u.userName,name:u.name,displayName:u.displayName,active:u.active,userType:u.userType,title:u.title,emails:[{value:u.userName,type:"work",primary:true}],photos:[{value:u.photo,type:"thumbnail",primary:true}],addresses:[{locality:u.location,country:u.country,type:"work"}],phoneNumbers:[{value:u.phone,type:"work"}],"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User":{organization:u.organization,department:u.department,...(u.manager ? {manager:{value:u.manager}}:{})}}));
 const scimGroups = seed.groups.map(g => ({schemas:["urn:ietf:params:scim:schemas:core:2.0:Group"],id:g.id,displayName:g.displayName,members:g.members}));
 const json = (name:string, value:unknown) => writeFileSync(dir+"/"+name,JSON.stringify(value,null,2)+"\n");
 json("directory.json",{tenant,name:archetypes[tenant as keyof typeof archetypes].name,organizations:seed.organizations,users:seed.users,groups:seed.groups});
 json("users.scim.json",scimUsers);json("groups.scim.json",scimGroups);
 writeFileSync(dir+"/users.csv",csv(users.map(u=>({...u,givenName:u.name.givenName,familyName:u.name.familyName})),["id","userName","email","displayName","givenName","familyName","active","userType","title","organization","department","managerId","location","country","phone","photoFile"]));
 writeFileSync(dir+"/groups.csv",csv(groups,["id","displayName","kind","memberCount","memberIds"]));
 writeFileSync(dir+"/memberships.csv",csv(memberships,["groupId","groupName","userId","userDisplayName"]));
 writeFileSync(dir+"/organizations.csv",csv(seed.organizations,["name","employees","vendors","head"]));
 console.log(tenant,users.length,"users",groups.length,"groups",memberships.length,"memberships");
}
