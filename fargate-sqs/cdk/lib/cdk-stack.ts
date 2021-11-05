import * as cdk from '@aws-cdk/core';
import * as sqs from '@aws-cdk/aws-sqs';
import { InterfaceVpcEndpointAwsService, Vpc } from '@aws-cdk/aws-ec2';
import { Cluster, ContainerImage } from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import path = require('path');

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 3
    });

    const sqsQueue = new sqs.Queue(this, 'Queue', {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    const sqsEndpoint = vpc.addInterfaceEndpoint('SqsInterfaceEndpoint', {
      service: InterfaceVpcEndpointAwsService.SQS,
    });

    const cluster = new Cluster(this, 'Cluster', {
      vpc: vpc
    });

    const fargate = new ApplicationLoadBalancedFargateService(this, 'FargateService', {
      cluster: cluster,
      cpu: 512,
      desiredCount: 1,
      taskImageOptions: {
        image: ContainerImage.fromAsset(path.join(__dirname, '../src/')),
        environment: {
          queueUrl: sqsQueue.queueUrl,
          region: process.env.CDK_DEFAULT_REGION!
        },
      },
      assignPublicIp: false,
      memoryLimitMiB: 2048,
    });

    // Allow read and write actions from the Fargate Task Definition only
    sqsEndpoint.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        actions: [
          'sqs:SendMessage',
          'sqs:ReceiveMessage'
        ],
        resources: [
          sqsQueue.queueArn
        ],
        conditions: {
          'ArnEquals': {
            'aws:PrincipalArn': `${fargate.taskDefinition.taskRole.roleArn}`
          }
        }
      })
    );

    // Read and Write permissions for Fargate
    sqsQueue.grantSendMessages(fargate.taskDefinition.taskRole);
    sqsQueue.grantConsumeMessages(fargate.taskDefinition.taskRole);
  }
}