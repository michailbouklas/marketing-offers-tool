# Google Analytics — connecting a brand (guide for the marketing team)

This guide walks you through the two things an admin needs before a brand's
website data can appear on the **Google Analytics** page of the marketing
tool:

1. the brand's **GA4 property id** (a number such as `123456789`), and
2. a **service-account JSON key** that the tool uses to read that property.

You do this once per GA4 property. A brand with several websites or apps may
have several properties; repeat the steps for each one.

> **Who can do this?** Finding the property id needs any access to the GA4
> property. Creating the service-account key needs access to a Google Cloud
> project (ask IT if your Google account has none). Granting the service
> account access to the property needs the **Administrator** role on that GA4
> property (or on its account).

---

## Part 1 — Find the GA4 property id

1. Open [analytics.google.com](https://analytics.google.com) and sign in with
   the Google account that has access to the brand's analytics.
2. In the top-left property picker, choose the brand's **GA4 property** (the
   list may also show an _account_ above it and _data streams_ below it — you
   want the property, usually named after the brand or its website).
3. Click **Admin** (the gear icon at the bottom-left).
4. In the **Property** column, click **Property details** (older interfaces
   call it **Property settings**).
5. At the top-right of that page you will see **Property ID** followed by a
   number of about 9 digits, for example `Property ID 123456789`. Copy that
   number.

**Common mistakes**

- A code that starts with `G-` (e.g. `G-AB12CD34EF`) is a _Measurement ID_
  from a data stream, not the property id. The tool will refuse it.
- A code that starts with `UA-` belongs to the old Universal Analytics. Those
  properties stopped collecting data and cannot be used; the brand needs a GA4
  property.
- The URL in your browser also contains the id: in
  `https://analytics.google.com/analytics/web/#/p123456789/...` the number
  after `/p` is the property id.

Write down the property id and the name of the property; you will enter both
in the tool.

---

## Part 2 — Create the service-account JSON key

A _service account_ is a robot identity that belongs to a Google Cloud
project. The marketing tool signs in as this robot to read the property. Do
this once per Google Cloud project; the same service account can be reused
for every property you grant it access to. If IT already created one for the
marketing tool, skip to **Part 3** and only ask them for its email address
and a JSON key.

### 2.1 Open or create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   sign in.
2. In the project picker at the top of the page, select an existing project
   (for example a company project IT recommends), or click **New project**,
   give it a name such as `marketing-tool-analytics`, and click **Create**.
   Wait a few seconds and make sure the new project is selected.

### 2.2 Enable the Google Analytics Data API

1. In the left menu choose **APIs & Services → Library** (or type
   "Analytics Data API" in the search bar at the top).
2. Open **Google Analytics Data API** (sometimes listed as _Google Analytics
   Data API v1_).
3. Click **Enable**. If the button already reads **Manage**, the API is
   enabled.

> The _Google Analytics Admin API_ and the old _Google Analytics Reporting
> API_ are different products. Only the **Data API** is required.

### 2.3 Create the service account

1. In the left menu choose **IAM & Admin → Service Accounts**.
2. Click **+ Create service account** at the top.
3. Fill in:
   - **Service account name**: e.g. `marketing-tool-ga-reader`
   - **Service account ID**: filled automatically
   - **Description**: e.g. "Read-only access to GA4 for the marketing tool"
4. Click **Create and continue**.
5. On the **Grant this service account access to project** step, do **not**
   add any role — click **Continue**. (Access to Analytics is granted inside
   Google Analytics in Part 3, not here.)
6. Click **Done**.
7. In the service accounts list, note the **Email** of the new account. It
   looks like `marketing-tool-ga-reader@your-project.iam.gserviceaccount.com`.
   You will need it in Part 3.

### 2.4 Download the JSON key

1. Click the service account's email to open it.
2. Open the **Keys** tab.
3. Click **Add key → Create new key**.
4. Choose **JSON** and click **Create**.
5. Your browser downloads a file named like
   `your-project-1a2b3c4d5e6f.json`. This file **is a password**: anyone who
   has it can read the analytics data of every property the account can see.
   - Do not email it, paste it in chat, or store it in a shared drive.
   - Upload it to the marketing tool (Part 4) and then delete it from your
     Downloads folder.
   - If it ever leaks, go back to the **Keys** tab, delete the key, and create
     a new one; then upload the new key in the tool (Edit → paste new key).

> If the **Create new key** option is greyed out, your organisation blocks
> service-account keys (a Google Workspace / Cloud policy). Ask IT to either
> allow key creation for this project or to create the key for you.

---

## Part 3 — Give the service account access to the GA4 property

1. Back in [analytics.google.com](https://analytics.google.com), select the
   brand's property and open **Admin**.
2. In the **Property** column, click **Property access management**.
3. Click **+** (top-right) → **Add users**.
4. In **Email addresses**, paste the service account's email from step 2.3
   (the one ending in `.iam.gserviceaccount.com`).
5. Untick **Notify new users by email** (a robot cannot read email).
6. Under **Direct roles and data restrictions**, choose **Viewer**. Nothing
   more is needed: Viewer is enough to read reports through the API.
7. Click **Add**.

If the brand has several GA4 properties, repeat Part 3 for each property, or
add the service account once at the **account** level (Admin → _Account_
column → **Account access management**) so every property under that account
inherits the Viewer role.

> Google may take a few minutes to apply the new access. If the tool's
> "Test connection" fails with a _permission_ message right after you added
> the account, wait five minutes and try again.

---

## Part 4 — Enter everything in the marketing tool (admins)

1. Open the marketing tool → **Admin → Brands** → the brand.
2. In the **Google Analytics properties** card click **Add property**.
3. Fill in:
   - **Display name**: how the property should be labelled on the dashboard,
     e.g. `Website` or `Mobile app`.
   - **GA4 property id**: the number from Part 1 (you may also paste it as
     `properties/123456789`).
   - **Service-account JSON key**: click **Choose file…** and pick the file
     downloaded in step 2.4, or open the file in a text editor and paste its
     whole contents. The form shows the service-account email it found; check
     it matches the one you added in Part 3.
4. Click **Add property**, then click **Test connection** on the new row.
   - **Verified** → done. The brand now appears on the **Google Analytics**
     page for every user the brand is assigned to.
   - _"Google denied access to this property…"_ → Part 3 was not done for
     this property, or the access has not propagated yet.
   - _"Google rejected the service-account key…"_ → the pasted JSON is not a
     valid key (wrong file, truncated paste, or the key was deleted in Google
     Cloud). Create a new key and use **Edit** to replace it.
   - _"Google Analytics property not found…"_ → the property id is wrong
     (check it is the 9-digit **Property ID**, not a `G-` code).
5. Delete the downloaded JSON file from your computer.

---

## Who sees what

- Users see the **Google Analytics** page only if they hold the
  _Analytics Viewer_, _Admin_ or _Super User_ role.
- On that page everyone — admins included — sees only the brands assigned to
  them under **Admin → Users**, and only brands that have at least one active
  GA4 property.
- Only admins and super users can add, edit or remove properties and keys.
  Brand managers can see the list but not change it.

## Quick checklist

| Step                                  | Where                                          | Result you need                         |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------- |
| Find the property id                  | GA → Admin → Property details                  | 9-digit **Property ID**                 |
| Enable the Data API                   | Cloud Console → APIs & Services → Library      | _Google Analytics Data API_ enabled     |
| Create the service account            | Cloud Console → IAM & Admin → Service Accounts | email ending `.iam.gserviceaccount.com` |
| Download a JSON key                   | Service account → Keys → Add key → JSON        | `*.json` file (treat as a password)     |
| Grant Viewer on the property          | GA → Admin → Property access management        | service account listed as **Viewer**    |
| Add the property in the tool and test | Tool → Admin → Brands → brand → Add property   | row shows **Verified**                  |
