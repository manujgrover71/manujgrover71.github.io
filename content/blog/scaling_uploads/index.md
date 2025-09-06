---
title: "Scaling Secure File Uploads"
description: ""
summary: "File uploads may seems trivial, but scaling it is the real challenge!"
date: 2024-09-07T16:27:22+05:30
lastmod: 2024-09-07T16:27:22+05:30
draft: false
weight: 50
categories: []
tags: [aws, s3]
contributors: [Manuj Grover]
pinned: false
homepage: false
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

## Background 

When building a system that supports file uploads - whether those are images, videos, or text files, it’s important to ensure the process is durable, secure, extensible, and cost-efficient.

At first glance, file uploads may appear straightforward. However, subtle challenges quickly emerge:
1. Unstable networks can interrupt uploads.
2. High concurrency can strain the system.
3. Clients might attempt to access or overwrite unintended files.
4. Multiple services may end up re-implementing their own upload logic in inconsistent ways.

Designing a robust solution requires balancing these trade-offs carefully.

### Uploading directly to file storage

![client is directly uploading to file server](images/scaling_uploads/client_upload_1.png)

This simplest approach allow clients to upload files directly to the storage layer (e.g., S3, GCS, Azure Blob) via REST APIs.

```go {title="insecure-client-upload.js" lineNos=true hl_lines=[9,18]}
const fs = require("fs");
const axios = require("axios");

async function uploadFile() {
  const filePath = "./secret.txt";
  const uploadUrl = "https://files.example.com/upload";

  // Client has to embed the API key here (security risk!)
  const API_KEY = "my-secret-api-key";  

  const formData = new FormData();
  formData.append("myfile", fs.createReadStream(filePath));

  try {
    const res = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        "Authorization": `Bearer ${API_KEY}` // 🔑 exposed in client code
      }
    });
    console.log("Upload success:", res.data);
  } catch (err) {
    console.error("Upload failed:", err.message);
  }
}

uploadFile();
```

Pros and cons of this approach:

| Pros | Cons |
| --- | --- |
| Direct writes are performant.. | Storing credentials on the client is a significant security risk. |
| Object storage systems natively handle large and concurrent writes. | Clients can upload arbitrary files without backend validation. |
| Cheaper in terms of data flow, since files bypass the backend. | Retry and resume logic must be handled entirely by the client. |

This method works in controlled or internal environments but falls short in production scenarios where security and validation are critical.

### Upload server taking the lead

To mitigate security risks and provide more control, an upload server can act as an intermediary between the client and the file storage. The server handles authentication, authorization, and validation before persisting files.

![client is uploading to the upload server, which is taking care of next steps](images/scaling_uploads/client_upload_2.png)

{{< tabs "upload-2-tabs" >}}
{{< tab "server.go" >}}
```go {lineNos=true hl_lines=[10,17,18]}
func uploadHandler(w http.ResponseWriter, r *http.Request) {
    file, handler, err := r.FormFile("myfile")
    if err != nil {
        http.Error(w, "Error retrieving file", http.StatusBadRequest)
        return
    }
    defer file.Close()

    // Save file to disk
    dst, err := os.Create("/uploads/" + handler.Filename)
    if err != nil {
        http.Error(w, "Error saving file", http.StatusInternalServerError)
        return
    }
    defer dst.Close()

    // the server is copying the file from network buffer
    io.Copy(dst, file)

    fmt.Fprintf(w, "File %s uploaded successfully", handler.Filename)
}
```

{{< /tab >}}
{{< tab "router.go" >}}

```go {lineNos=true}
r := mux.NewRouter()
r.HandleFunc("/upload", uploadHandler).Methods("POST")
http.ListenAndServe(":8080", r)

```

{{< /tab >}}
{{< tab "bash" >}}

```bash
curl -F "myfile=@example.txt" http://localhost:8080/upload
```

{{< /tab >}}
{{< /tabs >}}

Pros and cons of this approach:

| Pros | Cons |
| --- | --- |
| Centralized control over authentication and authorization. | Becomes a scalability bottleneck under high load. |
| The upload server can enforce rules such as max size, file type etc | Resource-intensive for large payloads (I/O, memory, multiple network hops). |
| Enables preprocessing (compression, watermarking, encryption) | Users can experience high latencies due to multiple hops in the overall system |

This pattern is common for smaller payloads (e.g., uploading blog content or documents) but becomes inefficient for large media files.

## PreSigned URL to the rescue!

How about we provide the client with a time-bound, permission-limited way of storaging resource directly in the file storage? This is where Pre-Signed URL (AWS S3) or Shared Access Storage (Azure SAS) comes into picture.

![](images/scaling_uploads/client_upload_3.png)

**How it works:**

1. The client requests a pre-signed URL from the upload server.
2. The upload server validates the request (file type, user permissions, size limits, etc.) and generates the pre-signed URL.
3. The client uploads the file directly to object storage using this URL.
4. For large files, the server can generate multiple pre-signed URLs for chunked uploads, which the client can use concurrently.

In case of failure, the client can just retry uploading on the same pre-signed URL which makes it tolerant against unstable network issues.

This approach can be extended further by having the client send an upload acknowledgment to the server. The server then publishes an event - containing file details, type, and flow to the message bus. Downstream consumers can subscribe to this event and perform their respective actions independently.

![](images/scaling_uploads/client_upload_4.png)

Beyond solving the challenge of large file handling, this design also provides a single, standardized upload service that all internal systems can reuse instead of building their own bespoke solutions.

{{< tabs "upload-3-tabs" >}}
{{< tab "presign_handler.go" >}}
```go { lineNos=true hl_lines=["10-16"] }
func generatePreSignURL(w http.ResponseWriter, r *http.Request) {
  key := r.URL.Query().Get("filename")
  if key == "" {
    http.Error(w, "missing filename", http.StatusBadRequest)
    return
  }

  // handling validations based on filetype, flow, max file size etc.

  psClient := s3.NewPresignClient(s3Client)
  presignedReq, err := psClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
    Bucket: aws.String(bucketName),
    Key:    aws.String(key),
  }, func(po *s3.PresignOptions) {
    po.Expires = 15 * time.Minute // valid for 15 minutes
  })

  if err != nil {
    http.Error(w, "could not generate presigned URL", http.StatusInternalServerError)
    return
  }

  fmt.Fprintf(w, presignedReq.URL)
}

```
{{< /tab >}}
{{< tab "client-upload.js" >}}
```js {lineNos=true hl_lines=[9, "13-15", "18-22"]}
const fs = require("fs");
const axios = require("axios");

async function uploadFile() {
  const filename = "example.txt";
  const fileContent = fs.readFileSync(filename);

  // Step 1: Ask server for presigned URL
  const presignedRes = await axios.get(`http://localhost:8080/get-presigned-url?filename=${filename}`);
  const uploadUrl = presignedRes.data;

  // Step 2: Upload file directly to S3
  await axios.put(uploadUrl, fileContent, {
    headers: { "Content-Type": "application/octet-stream" },
  });

  // Step 3: Send acknowledgment back to upload server
  await axios.post("http://localhost:8080/ack", {
    filename: filename,
    size: fileContent.length,
    uploadedAt: new Date().toISOString(),
  });
}

uploadFile().catch(console.error);
```
{{< /tab >}}
{{< tab "ack_handler.go" >}}
```go {lineNos=true hl_lines=["23-26", 28]}
type Ack struct {
	Filename   string `json:"filename"`
	Size       int    `json:"size"`
	UploadedAt string `json:"uploadedAt"`
}

var producer sarama.SyncProducer

func ackHandler(w http.ResponseWriter, r *http.Request) {
	var ack Ack
	if err := json.NewDecoder(r.Body).Decode(&ack); err != nil {
		http.Error(w, "invalid ack payload", http.StatusBadRequest)
		return
	}

	eventData, err := json.Marshal(ack)
	if err != nil {
		http.Error(w, "failed to serialize event", http.StatusInternalServerError)
		return
	}

	// Publish event to Kafka topic
	msg := &sarama.ProducerMessage{
		Topic: "<sample_topic>",
		Value: sarama.ByteEncoder(eventData),
	}

	partition, offset, err := producer.SendMessage(msg)
	if err != nil {
		http.Error(w, "failed to publish event", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "Ack received and event published for %s", ack.Filename)
}
```
{{< /tab >}}
{{< /tabs >}}


## Summary

1. **Direct uploads** are cheap and fast, but insecure and hard to control.
2. **Upload servers** give you control and validation, but introduce scalability bottlenecks and higher costs.
3. **Pre-signed URLs with event-driven acknowledgment** strike the right balance, clients upload directly to storage for scalability, while the server remains the gatekeeper for security, validation, and orchestration.

In the end, the *best* solution depends on your use case. For small apps, a simple upload server may suffice. For production-scale systems, direct-to-storage with pre-signed URLs and event-driven processing is often the sweet spot.
