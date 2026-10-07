import csv,json,uuid,hashlib,sys
from pathlib import Path
p=Path(sys.argv[1] if len(sys.argv)>1 else '../sources/SampleAADUserData.csv')
with p.open(newline='') as f:
 next(f); rows=list(csv.DictReader(f))
assert len(rows)==267
employees=[r for r in rows if r['department']!='1099 Contractor']; vendors=[r for r in rows if r['department']=='1099 Contractor']
assert (len(employees),len(vendors))==(238,29)
ceo=next(r for r in employees if r['mailNickName']=='danj');employees.remove(ceo); employees.insert(0,ceo)
# Each team includes its head. Organization heads occupy the first team's first slot.
specs=[
('Executive Office & Strategy',7,0,'Chief Executive Officer', [('Executive Office',7,['President & Chief Operating Officer','Chief of Staff & VP, Corporate Strategy','Director, Corporate Strategy','Strategy Manager','Executive Operations Manager','Executive Assistant'])]),
('Investments & Capital Markets',31,2,'Chief Investment Officer',[('Acquisitions & Investments',17,['SVP, Acquisitions','Director, Acquisitions – West','Director, Acquisitions – East','Director, Acquisitions – Europe','Senior Acquisitions Manager','Acquisitions Manager','Senior Investment Associate','Investment Associate','Senior Financial Analyst – Investments','Financial Analyst – Investments','Investment Analyst']),('Capital Markets',8,['VP, Capital Markets','Director, Debt Capital Markets','Director, Equity & Joint Ventures','Capital Markets Manager','Senior Capital Markets Associate','Capital Markets Associate','Capital Markets Analyst']),('Portfolio Strategy & Research',6,['Director, Portfolio Strategy & Research','Senior Real Estate Economist','Market Research Manager','Portfolio Strategy Manager','Senior Research Analyst','Research Analyst'])]),
('Development',38,7,'Chief Development Officer',[('Regional Development',27,['SVP, Development – West','SVP, Development – East','VP, Development – Europe','Development Director','Senior Development Manager','Development Manager','Senior Development Associate','Development Associate','Development Analyst']),('Planning & Entitlements',7,['VP, Planning & Entitlements','Director, Entitlements','Entitlements Manager','Land Use Manager','Development Planning Manager','Senior Planning Associate','Development Analyst – Entitlements']),('Development Operations',4,['Director, Development Operations','Development Operations Manager','Development Program Manager','Development Coordinator'])]),
('Design & Construction',30,8,'EVP, Design & Construction',[('Construction',17,['SVP, Construction','Construction Director','Senior Construction Manager','Construction Manager','Senior Project Manager – Construction','Project Manager – Construction','Project Controls Manager','Cost Manager','Construction Analyst']),('Design',7,['VP, Design','Design Director','Senior Design Manager','Design Manager','Architectural Project Manager','Interior Design Manager','Design Coordinator']),('Preconstruction & Procurement',6,['Director, Preconstruction','Preconstruction Manager','Senior Estimator','Construction Procurement Manager','Strategic Sourcing Manager – Construction','Contracts Manager – Construction'])]),
('Asset & Property Management',35,5,'EVP, Real Estate Operations',[('Asset Management',16,['SVP, Asset Management','Portfolio Director','Senior Asset Manager','Asset Manager','Associate Asset Manager','Senior Asset Management Analyst','Asset Management Analyst']),('Property Operations',13,['VP, Property Operations','Regional Property Director – West','Regional Property Director – East','Regional Property Director – Europe','Senior Property Manager','Property Manager','Assistant Property Manager']),('Sustainability & Building Performance',6,['Director, Sustainability & ESG','Sustainability Manager','Building Performance Manager','Energy & Carbon Manager','ESG Reporting Manager','Sustainability Analyst'])]),
('Leasing, Marketing & Customer',25,2,'EVP, Leasing & Marketing',[('Leasing',12,['SVP, Leasing','Regional Leasing Director – West','Regional Leasing Director – East','Director, Leasing – Europe','Senior Leasing Manager','Leasing Manager','Senior Leasing Associate','Leasing Associate','Leasing Analyst']),('Marketing & Brand',8,['VP, Marketing & Brand','Director, Property Marketing','Senior Marketing Manager','Digital Marketing Manager','Content & Communications Manager','Marketing Specialist','Brand Designer']),('Tenant Experience & CRM',5,['Director, Tenant Experience','Tenant Experience Manager','CRM & Customer Insights Manager','Tenant Engagement Manager','Customer Experience Analyst'])]),
('Finance & Accounting',29,2,'Chief Financial Officer',[('FP&A & Corporate Finance',7,['VP, FP&A','Director, Financial Planning & Analysis','FP&A Manager','Senior Financial Analyst','Financial Analyst','Corporate Finance Analyst']),('Property Accounting',9,['Controller, Property Accounting','Property Accounting Director','Senior Property Accountant','Property Accountant','Development Accountant','Joint Venture Accountant']),('Corporate Accounting & Tax',6,['Corporate Controller','Accounting Manager','Senior Accountant','Staff Accountant','Tax Director','Tax Manager']),('Treasury',3,['Director, Treasury','Treasury Manager','Treasury Analyst']),('Procurement & Accounts Payable',4,['Director, Corporate Procurement','Strategic Sourcing Manager','AP Manager','Procurement Analyst'])]),
('Legal, Risk & Compliance',16,2,'General Counsel & Chief Risk Officer',[('Transactions & Real Estate Legal',7,['Deputy General Counsel – Real Estate','Senior Counsel – Acquisitions & Dispositions','Senior Counsel – Development','Senior Counsel – Leasing','Corporate Counsel – Real Estate','Real Estate Paralegal','Legal Operations Manager']),('Corporate, Governance & Employment',3,['Deputy General Counsel – Corporate','Corporate Counsel','Senior Counsel, Employment & Immigration']),('Risk, Compliance & Internal Audit',6,['VP, Risk & Compliance','Director, Enterprise Risk Management','Compliance Manager','Director, Internal Audit','Senior Internal Auditor','Risk Analyst'])]),
('People, Technology & Corporate Operations',27,1,'Chief People & Administrative Officer',[('People & HR',10,['VP, People','HR Business Partner – Investments & Corporate','HR Business Partner – Development & Operations','Talent Acquisition Manager','Senior Recruiter','People Operations Manager','Total Rewards Manager','Learning & Development Manager','People Analyst']),('Technology',10,['VP, Technology / CIO','Director, Enterprise Applications','Director, Infrastructure & Workplace Technology','Manager, Identity & Security','Enterprise Applications Manager','Senior Systems Engineer','Business Systems Analyst','Data & Analytics Engineer','IT Service Manager','IT Support Engineer']),('Corporate Operations',7,['Director, Corporate Operations','Workplace Experience Manager','Corporate Facilities Manager','Travel & Events Manager','Corporate Communications Manager','Administrative Coordinator','Executive Assistant'])])]
def uid(name):return str(uuid.uuid5(uuid.NAMESPACE_DNS,'summitridge.example:'+name))
users=[]; ei=vi=0; ceoid=uid('danj');orgs=[]
for org,count,vc,head,teams in specs:
 assert sum(n for _,n,_ in teams)==count
 orgids=[];leader=None
 for ti,(team,n,titles) in enumerate(teams):
  teamhead=None; managers=[]
  for i in range(n):
   r=employees[ei];ei+=1; id=uid(r['mailNickName'])
   if ti==0 and i==0:title=head;leader=id;manager=None if id==ceoid else ceoid
   elif i==0:title=titles[0];manager=leader;teamhead=id
   else:
    offset=i-1 if ti==0 else i
    title=titles[min(offset,len(titles)-1)] if offset<len(titles) else titles[-min(3,len(titles))+(offset-len(titles))%min(3,len(titles))]
    manager=(teamhead or leader) if len(managers)==0 or any(k in title for k in ['SVP','VP,','Director']) else managers[(i-1)%len(managers)]
   if any(k in title for k in ['Director','SVP','VP,']):managers.append(id)
   if ti==0 and i==1:teamhead=id
   user={'id':id,'userName':r['mailNickName']+'@summitridge.example','displayName':r['displayName'].strip(),'name':{'givenName':r['givenName'].strip(),'familyName':r['surname'].strip()},'active':r['accountEnabled']=='True','userType':'Employee','title':title,'organization':org,'department':team,'manager':manager,'location':r['city'],'country':r['country'],'phone':r['telephoneNumber']}
   users.append(user);orgids.append(id)
 for i in range(vc):
  r=vendors[vi];vi+=1;team=teams[i%len(teams)][0]; candidates=[u for u in users if u['organization']==org and u['department']==team and 'Manager' in u['title']]
  u={'id':uid(r['mailNickName']),'userName':r['mailNickName']+'@partners.summitridge.example','displayName':r['displayName'].strip(),'name':{'givenName':r['givenName'].strip(),'familyName':r['surname'].strip()},'active':r['accountEnabled']=='True','userType':'Contractor','title':{'Development':'Development Consultant','Design & Construction':['Architect','MEP Engineering Consultant','Structural Engineering Consultant','Civil Engineering Consultant','Cost Consultant','Project Controls Consultant',"Construction Owner’s Representative",'Sustainability Consultant'][i%8],'Legal, Risk & Compliance':'Outside Counsel','Finance & Accounting':'Accounting Consultant','People, Technology & Corporate Operations':'Technology Consultant'}.get(org,'Embedded '+team+' Consultant'),'organization':org,'department':team,'manager':candidates[0]['id'] if candidates else leader,'location':r['city'],'country':r['country'],'phone':r['telephoneNumber']};users.append(u);orgids.append(u['id'])
 orgs.append({'name':org,'employees':count,'vendors':vc,'head':leader})
assert ei==238 and vi==29
# Explicit purpose-bearing groups, never sensitive case information.
groups=[]
def group(name,kind,members):
 groups.append({'id':uid('group:'+name),'displayName':name,'kind':kind,'members':[{'value':u['id'],'display':u['displayName']} for u in members]})
def slug(s):return ''.join(c if c.isalnum() else '-' for c in s.upper()).strip('-')
for o in orgs:group('ORG-'+slug(o['name']),'Organization',[u for u in users if u['organization']==o['name']])
for team in dict.fromkeys(u['department'] for u in users):group('DEPT-'+slug(team),'Department',[u for u in users if u['department']==team])
for loc in dict.fromkeys(u['location'] for u in users):group('LOC-'+slug(loc),'Location',[u for u in users if u['location']==loc])
for typ in ['Employee','Contractor']:group('WORKFORCE-'+typ.upper(),'Workforce',[u for u in users if u['userType']==typ])
for manager in dict.fromkeys(u['manager'] for u in users if u['manager']):
 direct=[u for u in users if u['manager']==manager];group('MGR-'+manager,'Direct Reports',direct)
for role,match in [('EXECUTIVES',lambda u:u['id'] in [o['head'] for o in orgs]),('HR-BUSINESS-PARTNERS',lambda u:'HR Business Partner' in u['title']),('IDENTITY-ADMINISTRATORS',lambda u:'Identity & Security' in u['title']),('LEGAL-COUNSEL',lambda u:'Counsel' in u['title']),('FINANCE-APPROVERS',lambda u:u['organization']=='Finance & Accounting' and any(x in u['title'] for x in ['Director','Controller','Manager','Officer']))]:group('ROLE-'+role,'Role',[u for u in users if match(u)])
for app,orgnames in [('YARDI',['Asset & Property Management','Finance & Accounting']),('PROCORE',['Development','Design & Construction']),('SALESFORCE',['Leasing, Marketing & Customer']),('ARGUS',['Investments & Capital Markets','Asset & Property Management']),('WORKDAY',['People, Technology & Corporate Operations']),('IMANAGE',['Legal, Risk & Compliance']),('MICROSOFT365',[o['name'] for o in orgs])]:group('APP-'+app+'-USERS','Application',[u for u in users if u['organization'] in orgnames])
for i,project in enumerate(['Harbor Point','Cedar Commons','Union Yard','Ridgeview Logistics','Parkside Residences','Westhaven Campus']):group('PROJECT-'+slug(project),'Project',[u for j,u in enumerate(users) if j%6==i and u['organization'] in ['Development','Design & Construction','Asset & Property Management','Leasing, Marketing & Customer','Legal, Risk & Compliance','Finance & Accounting']])

managerids={u['manager'] for u in users if u['manager']}
for o in orgs:group('LEADERSHIP-'+slug(o['name']),'Leadership',[u for u in users if u['organization']==o['name'] and u['id'] in managerids])
projectgroups=[g for g in groups if g['kind']=='Project']
for g in projectgroups:group(g['displayName']+'-EXTERNAL','Project',[u for u in users if u['userType']=='Contractor' and any(m['value']==u['id'] for m in g['members'])])
group('ROLE-PEOPLE-MANAGERS','Role',[u for u in users if u['id'] in managerids])
group('ROLE-PROCUREMENT','Role',[u for u in users if 'Procurement' in u['title'] or 'Sourcing' in u['title']])
assert len(groups)==185
data={'tenant':'realestate','company':'Summit Ridge Properties','archetype':'Real Estate Investment, Development & Property Management','organizations':orgs,'users':users,'groups':groups,'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
Path('data/summit-ridge.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
print(len(users),'identities',len(groups),'groups')
