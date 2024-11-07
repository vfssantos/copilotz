CREATE INDEX idx_logs_executionId ON logs(executionId); 
CREATE INDEX idx_logs_createdAt ON logs(createdAt DESC); 
CREATE INDEX idx_logs_thread_extId_expr ON logs (json_extract(input, '$.0.thread.extId'));