# Firestore Database Schema

## Collection Structure

### 1. users
```typescript
{
  id: string;                    // Auth UID
  email: string;
  role: 'admin' | 'editor' | 'presenter' | 'user';
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- Compound: `email` (ascending)

**Security Rules:**
- Read: Owner only
- Write: Admin only

---

### 2. conferences
```typescript
{
  id: string;
  name: BilingualValue;          // { ko: string, en: string }
  description: BilingualValue;
  startDate: string;             // ISO 8601 date string
  endDate: string;
  venue: BilingualValue;
  organizer: string;
  status: 'draft' | 'published';
  branding: {
    logoUrl?: string;
    eventName?: BilingualValue;
    primaryColor?: string;       // HEX color
    secondaryColor?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- Single: `status` (ascending)
- Single: `startDate` (descending)
- Compound: `status` + `startDate` (ascending, descending)

**Security Rules:**
- Read: Public (if status === 'published')
- Write: Admin/Editor only

---

### 3. publications (Subcollection of conferences)
```typescript
{
  id: string;
  conferenceId: string;         // Parent document reference
  type: 'abstract' | 'poster' | 'presentation';
  title: BilingualValue;
  coverImage?: string;          // Firebase Storage URL
  status: 'draft' | 'published';
  publishedAt?: Timestamp;
  order: number;                // Display order
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- Single: `status` (ascending)
- Single: `order` (ascending)
- Compound: `conferenceId` + `order` (ascending, ascending)

**Security Rules:**
- Read: Public (if status === 'published')
- Write: Admin/Editor/Presenter (if owner)

---

### 4. articles (Subcollection of publications)
```typescript
{
  id: string;
  publicationId: string;        // Parent document reference
  title: BilingualValue;
  author: string;
  toc: TOCItem[];              // Hierarchical table of contents
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- Single: `order` (ascending)
- Compound: `publicationId` + `order` (ascending, ascending)

**Security Rules:**
- Read: Public (if parent publication is published)
- Write: Admin/Editor only

---

### 5. contentBlocks (Subcollection of articles)
```typescript
{
  id: string;
  articleId: string;           // Parent document reference
  type: 'heading' | 'text' | 'image' | 'video' | 'ad' | 'list' | 'footnote';
  content: any;                // Type-specific content
  order: number;               // Display order
  createdAt: Timestamp;
}
```

**Indexes:**
- Single: `order` (ascending)
- Compound: `articleId` + `order` (ascending, ascending)

**Security Rules:**
- Read: Public (if parent article is published)
- Write: Admin/Editor only

---

### 6. footnotes (Subcollection of articles)
```typescript
{
  id: string;
  articleId: string;           // Parent document reference
  number: number;
  content: BilingualValue;
  referenceId: string;         // Block ID reference
  createdAt: Timestamp;
}
```

**Indexes:**
- Single: `number` (ascending)
- Compound: `articleId` + `number` (ascending, ascending)

**Security Rules:**
- Read: Public (if parent article is published)
- Write: Admin/Editor only

---

### 7. bookmarks (Subcollection of users)
```typescript
{
  id: string;
  userId: string;              // Parent document reference
  publicationId: string;
  articleId?: string;
  blockId?: string;
  title: string;
  description?: string;
  createdAt: Timestamp;
}
```

**Indexes:**
- Single: `createdAt` (descending)
- Compound: `userId` + `publicationId` (ascending, ascending)

**Security Rules:**
- Read: Owner only
- Write: Owner only

---

### 8. highlights (Subcollection of users)
```typescript
{
  id: string;
  userId: string;              // Parent document reference
  publicationId: string;
  articleId?: string;
  blockId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'orange';
  note?: string;
  createdAt: Timestamp;
}
```

**Indexes:**
- Single: `createdAt` (descending)
- Compound: `userId` + `blockId` (ascending, ascending)

**Security Rules:**
- Read: Owner only
- Write: Owner only

---

## Collection Hierarchies

```
users/{userId}
  └── bookmarks/{bookmarkId}
  └── highlights/{highlightId}

conferences/{conferenceId}
  └── publications/{publicationId}
      └── articles/{articleId}
          ├── contentBlocks/{blockId}
          └── footnotes/{footnoteId}
```

---

## Composite Indexes

### Conferences Collection
| Fields                    | Index Mode | Scope |
|---------------------------|------------|-------|
| status (asc), startDate (desc) | Composite | Collection |

### Publications Collection
| Fields                              | Index Mode | Scope |
|-------------------------------------|------------|-------|
| conferenceId (asc), order (asc)     | Composite | Collection |
| status (asc)                        | Single    | Collection |

### Articles Collection
| Fields                              | Index Mode | Scope |
|-------------------------------------|------------|-------|
| publicationId (asc), order (asc)    | Composite | Collection |

### ContentBlocks Collection
| Fields                              | Index Mode | Scope |
|-------------------------------------|------------|-------|
| articleId (asc), order (asc)        | Composite | Collection |

---

## Data Validation Rules

### Conferences
- `name.ko` required, length >= 2
- `description.ko` required, length >= 10
- `startDate` < `endDate`
- `status` must be 'draft' or 'published'
- `branding.primaryColor` must be valid HEX color

### Publications
- `title.ko` required, length >= 2
- `type` must be 'abstract', 'poster', or 'presentation'
- `status` must be 'draft' or 'published'
- `order` must be >= 0

### Articles
- `title.ko` required, length >= 2
- `author` required, length >= 2
- `order` must be >= 0

### ContentBlocks
- `type` must be valid block type
- `order` must be >= 0
- `content` must match type schema