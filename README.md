# 🚀 Shivam Enterprises ERP: Multi-Branch & Multi-Role Solution
### Developed by **Team Bharat** 🇮🇳

A robust, enterprise-grade ERP system designed for distributed electronics and electrical enterprises. This solution manages multiple branches (e.g., Pune, Kolhapur) with real-time inventory synchronization, automated financial auditing, and distinct role-based workflows.

---

## 🏗️ System Architecture
- **Backend**: Node.js & Express.js
- **Database**: MySQL (Robust Relations & Triggers)
- **Frontend**: Clean, Modern Vanilla JS & CSS (Zero-dependency, high performance)
- **Security**: JWT-based Authentication & Role-Based Access Control (RBAC)

---

## 🔥 Key Features for Judges

### 🏢 1. Multi-Branch Ecosystem
- **Branch Data Scoping**: Every user (Sales, Manager, Accountant) sees only the data relevant to their assigned branch (Pune vs Kolhapur).
- **Inter-Branch Transfers**: A sophisticated two-stage approval workflow (`pending_local` -> `pending_remote` -> `approved`) ensures stock never "disappears" during transit.

### 💰 2. Automated Financial Ledger
- **Instant Invoicing**: The system automatically generates a legal **Invoice** the moment a Branch Manager approves a Sales Order.
- **Auto Purchase Bills**: Stock entries in the warehouse instantly trigger **Purchase Bills** in the Accountant's ledger, ensuring no liability goes unrecorded.

### 📦 3. Advanced Inventory Control
- **Real-time Stock Levels**: Live tracking across categories (Switches, Wires, Fans, PVC).
- **Audit Trails**: Every "Stock In" or "Dispatch" is logged with a timestamp and the user who performed the action.
- **Low Stock Alerts**: (In Progress) System flags when inventory hits critical levels.

### 👥 4. Role-Based Dashboards
- **Admin**: Full oversight across all branches and user management.
- **Branch Manager**: Approves orders, manages transfers, and monitors local sales performance.
- **Sales/Warehouse**: Handles order creation and physical inventory intake.
- **Accountant**: Dedicated terminal for Revenue, Expenditure, and GST reporting.

---

## 🛠️ Setup Instructions

### 1. Database Setup
- Install MySQL 8.x.
- Create a database named `shivam_erp`.
- Import the schema from `backend/shivam_erp_schema.sql`.

### 2. Backend Config
- Navigate to `backend/`.
- `npm install`
- Copy `.env.example` to `.env` and fill in your DB credentials.
- `npm start`

### 3. Frontend Access
- Use any local server (e.g., `http-server`) to serve the root directory.
- Access dashboards via:
    - `/admin_index.html`
    - `/sales_panel_index.html`
    - `/branch_manager_dashboard.html`
    - `/Accountant.html`

---

## 📈 Future Roadmap
- [ ] Mobile App integration for field sales.
- [ ] AI-driven demand forecasting based on historical sales.
- [ ] Fully integrated barcode/QR scanning for items.

---
**Team Bharat** | *Innovating Enterprise Solutions*
