FRONT-END REQS:



Users:

&#x20;   Admin

&#x20;   Full-time lab workers

&#x20;   Student workers



Login / Authorization:

&#x20;   Email and password login

&#x20;   Role-based access to pages and functions

&#x20;   Password reset:

&#x20;       Verification code sent to email or phone number <-- for later

&#x20;       Code verification

&#x20;       New password creation

&#x20;   Logout

&#x20;   Blocked accounts cannot log in



Dashboard:

&#x20;   Inventory summary:

&#x20;       Total items

&#x20;       Low-stock items

&#x20;       Out-of-stock items

&#x20;   Recent inventory changes

&#x20;   Supply requests:

&#x20;       Pending

&#x20;       Approved

&#x20;       Rejected

&#x20;   Navigation:

&#x20;       Dashboard

&#x20;       Inventory

&#x20;       Supply Requests

&#x20;       Locations

&#x20;       User Management (Admin only)

&#x20;       Profile



Inventory:

&#x20;   Spaces:

&#x20;       Makerspace

&#x20;       Project room

&#x20;   Browse inventory by:

&#x20;       Space

&#x20;       Location

&#x20;       Group

&#x20;       Subgroup

&#x20;   Display item information:

&#x20;       Item name

&#x20;       Item ID

&#x20;       Group / subgroup

&#x20;       Location

&#x20;       Quantity

&#x20;       Optional description / notes

&#x20;   Inventory actions (All users):

&#x20;       Add new item

&#x20;       Edit existing item

&#x20;       Delete item (with confirmation)

&#x20;       Increase/decrease quantity

&#x20;       Move item to another location

&#x20;   Search:

&#x20;       Search by item name or ID

&#x20;       Filter by space, group, subgroup, and location

&#x20;       Filter low-stock / out-of-stock items



&#x20;   Locations: <-- ***Locations now are a part of the Inventory section***

&#x20;       View all spaces and locations

&#x20;       Add new location

&#x20;       Edit location

&#x20;       Delete location (with confirmation)

&#x20;       Assign items to locations

&#x20;       Existing spaces:

&#x20;           Makerspace

&#x20;           Project room



Groups / Subgroups:

&#x20;   View group hierarchy

&#x20;   Create new groups

&#x20;   Create new subgroups

&#x20;   Edit names

&#x20;   Delete groups/subgroups (with confirmation)

&#x20;   Prevent accidental removal of groups containing items



Supply Requests:

&#x20;   All users:

&#x20;       Create new request

&#x20;       Select existing item OR specify a new item

&#x20;       Specify requested quantity

&#x20;       Enter request reason / notes

&#x20;       Submit request

&#x20;       View request status

&#x20;   Admin and Full-time lab workers:

&#x20;       View pending requests

&#x20;       Approve requests

&#x20;       Reject requests

&#x20;       Add optional decision notes

&#x20;   Request statuses:

&#x20;       Pending

&#x20;       Approved

&#x20;       Rejected

&#x20;   Optional future statuses:

&#x20;       Ordered

&#x20;       Received

&#x20;       Cancelled



User Management (Admin only):

&#x20;   View all accounts

&#x20;   Create new account:

&#x20;       Name

&#x20;       Position / Role

&#x20;       Email

&#x20;       Phone number

&#x20;       Password

&#x20;   Edit account information

&#x20;   Change assigned role

&#x20;   Block / unblock account

&#x20;   Delete account (with confirmation)

&#x20;   Search and filter accounts by name, role, or status



User Profile:

&#x20;   View own account information:

&#x20;       Name

&#x20;       Position / Role

&#x20;       Email

&#x20;       Phone number

&#x20;   Change password

&#x20;   Password reset using email or phone verification code



Interface Requirements:

&#x20;   Responsive layout for desktops, tablets, and phones

&#x20;   Consistent navigation and page design

&#x20;   Form validation

&#x20;   Loading and error states

&#x20;   Confirmation dialogs for destructive actions

&#x20;   Success / error notifications

&#x20;   Disabled or hidden unauthorized actions

&#x20;   Accessible labels and keyboard-friendly controls



Recommended: <-- For later

&#x20;   Inventory change history

&#x20;   Low-stock thresholds

&#x20;   Request creation / decision timestamps

&#x20;   Notifications for request status changes

&#x20;   Pagination for long item lists



Integration: <-- For later

&#x20;   Connect front-end to backend API

&#x20;   Enforce all role permissions on backend as well as front-end

&#x20;   Never store or display plaintext passwords

&#x20;   Ensure quantity updates stay synchronized



