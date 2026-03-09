import boto3
import io
import logging
from botocore.exceptions import ClientError
from botocore.config import Config
from app.config import settings

logger = logging.getLogger(__name__)

class S3Service:
    def __init__(self):
        client_kwargs = {
            'aws_access_key_id': settings.AWS_ACCESS_KEY_ID,
            'aws_secret_access_key': settings.AWS_SECRET_ACCESS_KEY,
            'region_name': settings.AWS_DEFAULT_REGION,
            'config': Config(s3={'addressing_style': 'path'})
        }
        
        if settings.S3_ENDPOINT_URL:
            client_kwargs['endpoint_url'] = settings.S3_ENDPOINT_URL

        try:
            self.s3_client = boto3.client('s3', **client_kwargs)
            self.bucket = settings.S3_BUCKET_NAME
            # Note: We don't auto-create buckets in production for safety, 
            # but for this project we'll keep the check.
            self._ensure_bucket_exists()
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None

    def _ensure_bucket_exists(self):
        if not self.s3_client: return
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                logger.info(f"Bucket {self.bucket} not found. Creating...")
                if settings.AWS_DEFAULT_REGION == 'us-east-1':
                    self.s3_client.create_bucket(Bucket=self.bucket)
                else:
                    self.s3_client.create_bucket(
                        Bucket=self.bucket,
                        CreateBucketConfiguration={'LocationConstraint': settings.AWS_DEFAULT_REGION}
                    )
            else:
                logger.error(f"Error checking bucket {self.bucket}: {e}")

    def upload_encrypted_file(self, data: bytes, object_name: str) -> str:
        """Upload an encrypted byte-stream to S3."""
        if not self.s3_client:
            raise RuntimeError("S3 client not initialized.")
        try:
            # Wrap bytes in a file-like object for boto3
            file_obj = io.BytesIO(data)
            self.s3_client.upload_fileobj(
                file_obj, 
                self.bucket, 
                object_name,
                ExtraArgs={"ContentType": "application/octet-stream"}
            )
            s3_uri = f"s3://{self.bucket}/{object_name}"
            return s3_uri
        except ClientError as e:
            logger.error(f"Failed to upload encrypted data to S3: {e}")
            raise e

    def download_file(self, object_name: str) -> bytes:
        """Download an encrypted file from S3 as bytes."""
        if not self.s3_client:
            raise RuntimeError("S3 client not initialized.")
        try:
            file_obj = io.BytesIO()
            self.s3_client.download_fileobj(self.bucket, object_name, file_obj)
            return file_obj.getvalue()
        except ClientError as e:
            logger.error(f"Failed to download {object_name} from S3: {e}")
            raise e

    def delete_file(self, object_name: str):
        """Delete an object from S3."""
        if not self.s3_client: return
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=object_name)
            return True
        except ClientError as e:
            logger.error(f"Failed to delete {object_name} from S3: {e}")
            return False

s3_service = S3Service()
