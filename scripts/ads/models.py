from pydantic import BaseModel, UUID4, Field
from datetime import date
from typing import List, Literal, Optional


class GoogleAd(BaseModel):
    advertisement_url: str
    advertiser_name: Optional[str] = None
    advertiser_url: Optional[str] = None
    image_url: Optional[str] = None
    last_shown: Optional[date] = None


class AdStructuredOutput(BaseModel):
    id: UUID4 = Field(default_factory=UUID4)
    image_url: str
    image_description: str
    description_embeddings: Optional[List[float]] = None


class SentimentAnalysis(BaseModel):
    id: UUID4 = Field(default_factory=UUID4)
    ad_output_id: UUID4
    tone: str
    confidence: float = Field(ge=0.0, le=1.0)


class VisualAttribute(BaseModel):
    id: UUID4 = Field(default_factory=UUID4)
    feature_id: UUID4
    attribute: str
    value: str


class Feature(BaseModel):
    id: UUID4 = Field(default_factory=UUID4)
    ad_output_id: UUID4
    keyword: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    category: str
    # Category (e.g., "emotion", "product", "brand", "person", "setting", "text", "call-to-action")
    location: Literal[
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "middle-center",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
        "unknown",
    ]
    visual_attributes: Optional[List[VisualAttribute]] = None


class AdAnalysis(BaseModel):
    id: UUID4 = Field(default_factory=UUID4)
    image_description: str
    features: Optional[List[Feature]] = None
    sentiment: Optional[SentimentAnalysis] = None


class AdMetric(BaseModel):
    ad_id: UUID4
    impressions: int = Field(0, ge=0)  # Non-negative integer
    clicks: int = Field(0, ge=0)  # Non-negative integer
    ctr: Optional[float] = None


class JoinedFeatureMetric(BaseModel):
    ad_output_id: UUID4
    keyword: str
    confidence_score: float
    category: str
    location: Literal[
        "top-left",
        "top-center",
        "top-right",
        "middle-left",
        "middle-center",
        "middle-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
        "unknown",
    ]
    impressions: int
    clicks: int
    ctr: float
